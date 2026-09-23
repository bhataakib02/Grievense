# Blockchain Persistence & Deployment Safety Architecture

## Project: Blockchain-Based Public Grievance Tracking System
**Target Network:** Ethereum Sepolia (Chain ID: `11155111`)

---

## 1. Executive Summary & Authoritative Source of Truth

In this decentralized application:
1. **The Ethereum Sepolia EVM Blockchain is the EXCLUSIVE AUTHORITATIVE SOURCE OF TRUTH.**
2. All core entities—including **Departments, Department Admins, Officers, Categories, Grievances, Assignments, Status Transitions, Resolutions, Escalations, and Forensic Audit Logs**—reside permanently in smart contract storage on Ethereum Sepolia.
3. Neither React component state, browser memory, `localStorage`, `sessionStorage`, Node.js server memory, nor any local database acts as the persistence mechanism.
4. **Local operations (closing Remix, stopping localhost, closing browser tabs, or restarting development machines) CANNOT cause data loss.**

---

## 2. Definitive Lifecycle Events & Data Retention Matrix

| Scenario / Action | Does Blockchain Data Disappear? | Technical Explanation |
| :--- | :---: | :--- |
| **Closing Remix IDE** | ❌ **NO DATA LOSS** | Remix is merely a deployment and interaction client. Smart contracts deployed to Sepolia exist as immutable bytecode on thousands of global Ethereum nodes. Closing the Remix tab has zero effect on the blockchain. |
| **Closing Localhost (`npm run dev`)** | ❌ **NO DATA LOSS** | The local dev server only serves static JavaScript/CSS/HTML assets to your browser. No state is stored in Vite or Node.js. Upon restarting localhost, the frontend queries the same on-chain contracts. |
| **Closing Browser / Clearing Cache** | ❌ **NO DATA LOSS** | The browser only holds ephemeral UI state and cached web assets. When reopened, the dApp reconnects via MetaMask and re-reads live contract state directly from the Ethereum RPC. |
| **Restarting the Host PC** | ❌ **NO DATA LOSS** | Powering down your machine does not affect decentralized Ethereum nodes. The blockchain continues mining blocks and preserving contract storage continuously. |
| **Updating Frontend Code** | ❌ **NO DATA LOSS** | Code edits in React or styling updates change only how information is rendered. They do not invoke contract state-clearing functions. |
| **Switching RPC Providers** | ❌ **NO DATA LOSS** | Sepolia RPC nodes (Tenderly, PublicNode, Alchemy, Infura, etc.) all share the identical global Ethereum consensus ledger. |
| **Redeploying a Solidity Contract** | ⚠️ **NEW STORAGE** | **CRITICAL:** Deploying a new contract instance executes `CREATE`/`CREATE2`, provisioning a **brand-new Ethereum address with completely empty storage slots**. The old contract's storage is NOT deleted—it remains frozen at the old address, but the new contract starts with empty state. |
| **Changing `frontend/.env` Addresses** | ⚠️ **SWITCHES VIEW** | Pointing `.env` to newly deployed contract addresses directs the frontend to read the new contract's fresh storage. If records were not migrated, the frontend will show zero records because the *new* contract has zero records. |

---

## 3. Why Redeployment Creates New Storage (EVM Architecture)

In the Ethereum Virtual Machine:
- Contract storage consists of a 2^256 key-value mapping from 32-byte slot keys to 32-byte values.
- Storage is tightly coupled to the specific 20-byte contract address.
- When you compile and deploy `DepartmentManager.sol` or `GrievanceSystem.sol` again, the new contract is deployed to a new address (e.g. `0xABC...` instead of `0x123...`).
- The EVM provides **no native inheritance of storage between different contract addresses**.
- Therefore, redeployment creates a blank slate for that contract. Previous records are **not lost** (they remain queryable at the old contract address), but they do not automatically transfer to the new contract address.

---

## 4. Production Deployment Safety Framework

To prevent accidental redeployments and data disconnection, the project implements four safety pillars:

### Pillar 1: Deployment Manifests & History
- Authoritative active deployment manifest: [`deployments/sepolia/latest.json`](file:///d:/Grievense/deployments/sepolia/latest.json)
- Immutable historical manifests: [`deployments/sepolia/history/`](file:///d:/Grievense/deployments/sepolia/history/)
- Every deployment records:
  - `chainId` (`11155111`)
  - `network` (`sepolia`)
  - `deploymentVersion`
  - `deploymentTimestamp`
  - Contract addresses (`roleManager`, `departmentManager`, `grievanceSystem`, `escalationManager`, `auditTrail`)
  - Transaction hashes for auditing

### Pillar 2: Deployment Change Guard Banner
- The frontend includes [`DeploymentGuardBanner.jsx`](file:///d:/Grievense/frontend/src/components/common/DeploymentGuardBanner.jsx) in the root layout.
- At startup, the frontend compares active addresses in `.env` against `deployments/sepolia/latest.json`.
- If an address change is detected, a prominent warning alerts administrators:
  > **⚠️ NEW BLOCKCHAIN DEPLOYMENT DETECTED**
  > *A newly deployed Solidity contract has fresh storage and does NOT automatically contain records from the previous contract.*

### Pillar 3: Deployment Script Safety Guard
- [`scripts/deploy_sepolia_migration.js`](file:///d:/Grievense/scripts/deploy_sepolia_migration.js) strictly enforces pre-flight checks:
  1. Audits existing contract bytecodes on Sepolia.
  2. Creates an automatic state snapshot in `backups/sepolia/` before executing any transactions.
  3. Displays a warning regarding fresh storage slots.
  4. Requires the exact confirmation string: `CONFIRM_SEPOLIA_FRESH_DEPLOYMENT`. Without this, deployment aborts immediately.
  5. Never logs or leaks private keys.

### Pillar 4: Read-Only State Snapshots & Migration
- **Export Script:** [`scripts/export_sepolia_state.js`](file:///d:/Grievense/scripts/export_sepolia_state.js) exports the entire contract state into timestamped JSON files (`backups/sepolia/<timestamp>-state.json`).
- **Migration Script:** [`scripts/migrate_sepolia_state.js`](file:///d:/Grievense/scripts/migrate_sepolia_state.js) allows controlled migration of compatible entities (departments, categories, officers, admins) into newly deployed contracts with a mandatory `--dry-run` inspection step.

---

## 5. Migration Compatibility Matrix

| Entity Type | Can Be Migrated Automatically? | Technical Reason / Limitation |
| :--- | :---: | :--- |
| **Departments** | ✅ **YES** | Can be created by Super Admin calling `createDepartment(name, desc, admin)`. |
| **Categories** | ✅ **YES** | Can be created by Department Admin calling `createCategory(deptId, name, desc)`. |
| **Officers** | ✅ **YES** | Can be registered by Department Admin calling `registerOfficer(officer, deptId)`. |
| **Department Admins** | ✅ **YES** | Can be granted via `RoleManager.grantRole()` or assigned during department creation. |
| **SLA Parameters** | ✅ **YES** | Can be updated by Super Admin via `updateSlaDuration()`. |
| **Citizen Grievances** | ⚠️ **ARCHIVAL ONLY** | `createGrievance()` strictly sets `citizen = msg.sender`. An administrative migration script cannot sign transactions on behalf of individual citizen wallets without compromising non-repudiation. |
| **EVM Timestamps** | ❌ **CANNOT BACKDATE** | Block timestamps are minted by Ethereum consensus. Historical submission timestamps cannot be retroactively assigned to new blocks. |
| **Forensic Audit Log** | ❌ **CANNOT BACKDATE** | `AuditTrail.recordAudit()` records `block.timestamp` at call time. Past transaction hashes belong to the historical deployment. |

---

## 6. Role of Off-Chain Services (Supabase & IPFS)

### Supabase / PostgreSQL: Off-Chain Index Only
- As defined in [`backend/supabase_schema.sql`](file:///d:/Grievense/backend/supabase_schema.sql), Supabase is an **index and read cache** for high-frequency queries and filtering.
- **Strict Rule:** Supabase values must **NEVER** override verified on-chain values. If a discrepancy occurs, blockchain state is always the sole authority.

### IPFS: Off-Chain Evidence Persistence
- Binary evidence (PDFs, images) and large grievance descriptions are stored on IPFS.
- The cryptographic content identifier (**CID**) and keccak256 content hash are stored immutably on-chain.
- The server-side FastAPI proxy pins uploaded assets to Pinata IPFS to guarantee decentralized availability across different user machines.

---

## 7. Verification Test Suite

Run the automated persistence test to verify state retention across simulated restarts:
```bash
node tests/persistence_restart.test.js
```
The test verifies:
- State captured from Sepolia EVM
- Simulation of full process termination and cache wipe
- Re-query of contracts via isolated provider
- 100% identity of department counts, category records, and role states.
