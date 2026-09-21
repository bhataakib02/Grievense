# Remix IDE Deployment & Configuration Guide

**Blockchain-Based Public Grievance Tracking System**

This guide provides the exact step-by-step instructions for deploying the smart contract suite using [Remix IDE](https://remix.ethereum.org) and connecting it to the React/Vite + MetaMask frontend without any local blockchain dependencies.

---

## Prerequisites

1. **Browser**: Google Chrome, Brave, or Firefox with the **MetaMask** browser extension installed.
2. **MetaMask Network**: Ensure MetaMask is connected to your target EVM network (e.g., Sepolia Testnet, Holesky Testnet, Polygon Amoy, or a custom testnet).
3. **Funded Account**: The deployer wallet must have native testnet tokens (ETH/MATIC) to pay for contract deployment and transaction gas.

---

## Step 1: Open and Import Contracts in Remix IDE

1. Navigate to [https://remix.ethereum.org](https://remix.ethereum.org).
2. In the **File Explorer** tab, create a `contracts/` directory or use Remix's "Connect to localhost" (via `remixd`) or drag-and-drop the 7 contract files from `d:/Grievense/contracts/`:
   - `GrievanceTypes.sol` (Enums, structs, custom errors)
   - `IAuditTrail.sol` (Audit trail interface)
   - `RoleManager.sol` (RBAC & Citizen self-registration)
   - `DepartmentManager.sol` (Departments, categories, officer roster)
   - `GrievanceSystem.sol` (Core grievance lifecycle, evidence, resolutions)
   - `EscalationManager.sol` (SLA breach detection & escalation engine)
   - `AuditTrail.sol` (Tamper-evident, append-only forensic audit ledger)

> **Note on OpenZeppelin Imports**: `RoleManager.sol` imports `@openzeppelin/contracts/access/AccessControl.sol`. Remix resolves OpenZeppelin contracts via npm automatically.

---

## Step 2: Compiler Settings

1. Click on the **Solidity Compiler** icon on the left navigation bar.
2. Select **Compiler Version**: `0.8.20`, `0.8.24`, or `0.8.28` (matches `pragma solidity ^0.8.20;`).
3. Expand **Advanced Configurations**:
   - **EVM Version**: Select `default` or `cancun` / `shanghai` / `paris`.
   - **Enable optimization**: Checked (`200` runs).
4. Compile each contract or check **Auto compile**. Verify that all contracts compile with zero errors.

---

## Step 3: Deployment Order & Exact Constructor Arguments

In the **Deploy & Run Transactions** tab:
- **Environment**: Select **Injected Provider - MetaMask**.
- Confirm your MetaMask account is connected and shows your target network.

Deploy the contracts in the **exact dependency order** below, recording each deployed address:

### 1. Deploy `RoleManager`
- **Contract dropdown**: Select `RoleManager - contracts/RoleManager.sol`
- **Constructor Parameters**: None (`0` arguments)
- **Action**: Click **Deploy (Transact)** and confirm in MetaMask.
- **Copy Address**: `ROLE_MANAGER_ADDRESS = 0x...`
> *Note: The deploying address automatically receives `SUPER_ADMIN_ROLE`.*

### 2. Deploy `DepartmentManager`
- **Contract dropdown**: Select `DepartmentManager - contracts/DepartmentManager.sol`
- **Constructor Parameters**:
  - `_roleManager` (address): Enter `ROLE_MANAGER_ADDRESS`
- **Action**: Click **Deploy (Transact)** and confirm in MetaMask.
- **Copy Address**: `DEPARTMENT_MANAGER_ADDRESS = 0x...`

### 3. Deploy `GrievanceSystem`
- **Contract dropdown**: Select `GrievanceSystem - contracts/GrievanceSystem.sol`
- **Constructor Parameters**:
  - `_roleManager` (address): Enter `ROLE_MANAGER_ADDRESS`
  - `_departmentManager` (address): Enter `DEPARTMENT_MANAGER_ADDRESS`
- **Action**: Click **Deploy (Transact)** and confirm in MetaMask.
- **Copy Address**: `GRIEVANCE_SYSTEM_ADDRESS = 0x...`

### 4. Deploy `EscalationManager`
- **Contract dropdown**: Select `EscalationManager - contracts/EscalationManager.sol`
- **Constructor Parameters**:
  - `_roleManager` (address): Enter `ROLE_MANAGER_ADDRESS`
  - `_departmentManager` (address): Enter `DEPARTMENT_MANAGER_ADDRESS`
  - `_grievanceSystem` (address): Enter `GRIEVANCE_SYSTEM_ADDRESS`
- **Action**: Click **Deploy (Transact)** and confirm in MetaMask.
- **Copy Address**: `ESCALATION_MANAGER_ADDRESS = 0x...`

### 5. Deploy `AuditTrail`
- **Contract dropdown**: Select `AuditTrail - contracts/AuditTrail.sol`
- **Constructor Parameters**:
  - `_roleManager` (address): Enter `ROLE_MANAGER_ADDRESS`
- **Action**: Click **Deploy (Transact)** and confirm in MetaMask.
- **Copy Address**: `AUDIT_TRAIL_ADDRESS = 0x...`

---

## Step 4: Mandatory Post-Deployment Dependency Wiring

All wiring transactions must be signed by the **Super Admin** (the account that deployed `RoleManager`).

Under **Deployed Contracts** in Remix, expand each contract and call the following functions:

### A. Authorize Writer Contracts in `AuditTrail`
In the deployed `AuditTrail` instance:
1. Call `setAuthorizedWriter`:
   - `writer`: `ROLE_MANAGER_ADDRESS`
   - `authorized`: `true`
   - Click **transact** → Confirm in MetaMask.
2. Call `setAuthorizedWriter`:
   - `writer`: `DEPARTMENT_MANAGER_ADDRESS`
   - `authorized`: `true`
   - Click **transact** → Confirm in MetaMask.
3. Call `setAuthorizedWriter`:
   - `writer`: `GRIEVANCE_SYSTEM_ADDRESS`
   - `authorized`: `true`
   - Click **transact** → Confirm in MetaMask.
4. Call `setAuthorizedWriter`:
   - `writer`: `ESCALATION_MANAGER_ADDRESS`
   - `authorized`: `true`
   - Click **transact** → Confirm in MetaMask.

### B. Wire `AuditTrail` into Business Contracts
1. In `RoleManager`:
   - Call `setAuditTrail(auditTrailAddress)` → pass `AUDIT_TRAIL_ADDRESS` → Confirm.
2. In `DepartmentManager`:
   - Call `setAuditTrail(auditTrailAddress)` → pass `AUDIT_TRAIL_ADDRESS` → Confirm.
3. In `GrievanceSystem`:
   - Call `setAuditTrail(auditTrailAddress)` → pass `AUDIT_TRAIL_ADDRESS` → Confirm.
4. In `EscalationManager`:
   - Call `setAuditTrail(auditTrailAddress)` → pass `AUDIT_TRAIL_ADDRESS` → Confirm.

### C. Wire `EscalationManager` into `GrievanceSystem`
In the deployed `GrievanceSystem` instance:
- Call `setEscalationManager(escalationManagerAddress)`:
  - pass `ESCALATION_MANAGER_ADDRESS`
  - Click **transact** → Confirm in MetaMask.

---

## Step 5: Initial Data Seeding (Recommended for Immediate Demo)

You can seed initial departments, categories, and roles directly from Remix or via the Super Admin Dashboard once connected.

### A. Create Initial Departments
In `DepartmentManager`:
- Call `createDepartment`:
  - `name`: `"Public Works & Sanitation"`
  - `admin`: `<DEPARTMENT_ADMIN_WALLET_ADDRESS>`
  - Click **transact** → Confirm.
  *(This creates Department ID `1`)*

### B. Create Grievance Categories
In `DepartmentManager`:
- Call `createCategory`:
  - `name`: `"Road & Pothole Repair"`
  - `description`: `"Road defects, potholes, surface degradation"`
  - Click **transact** → Confirm.
  *(Creates Category ID `1`)*
- Call `createCategory`:
  - `name`: `"Waste Management & Sanitation"`
  - `description`: `"Garbage collection, sewage, environmental cleanup"`
  - Click **transact** → Confirm.
  *(Creates Category ID `2`)*

### C. Grant Roles
In `RoleManager`:
- Grant Department Admin:
  - Call `grantDepartmentAdminRole(account)` → pass `<DEPARTMENT_ADMIN_WALLET_ADDRESS>` → Confirm.
- Grant Officer Role:
  - Call `grantOfficerRole(account)` → pass `<OFFICER_WALLET_ADDRESS>` → Confirm.

### D. Assign Officer to Department
In `DepartmentManager` (using the Department Admin or Super Admin account):
- Call `addOfficerToDepartment`:
  - `departmentId`: `1`
  - `officer`: `<OFFICER_WALLET_ADDRESS>`
  - Click **transact** → Confirm.

---

## Step 6: Configure Frontend Environment Variables

Open `frontend/.env` and insert the deployed contract addresses and chain ID:

```env
# Smart Contract Deployed Addresses from Remix
VITE_ROLE_MANAGER_ADDRESS=0x<Your_RoleManager_Address>
VITE_DEPARTMENT_MANAGER_ADDRESS=0x<Your_DepartmentManager_Address>
VITE_GRIEVANCE_SYSTEM_ADDRESS=0x<Your_GrievanceSystem_Address>
VITE_ESCALATION_MANAGER_ADDRESS=0x<Your_EscalationManager_Address>
VITE_AUDIT_TRAIL_ADDRESS=0x<Your_AuditTrail_Address>

# Target Chain ID (e.g., 11155111 for Sepolia, 17000 for Holesky)
VITE_TARGET_CHAIN_ID=11155111

# Optional: Read-only RPC provider URL for Public Verification page (no wallet required)
VITE_RPC_URL=https://rpc.sepolia.org

# IPFS Gateway URL
VITE_IPFS_GATEWAY_URL=https://ipfs.io
```

---

## Step 7: Launch and Operate the DApp

1. Navigate to the `frontend/` directory and start the Vite development server:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open `http://localhost:5173` in your browser.
3. Click **Connect Wallet** (MetaMask).
4. Verify in the Header:
   - Connected account address is visible.
   - Connected network matches `VITE_TARGET_CHAIN_ID`.
   - Smart Contract Deployment Status displays **All 5 Contracts Configured**.
5. All user workflows (Citizen, Officer, Department Admin, Super Admin, Public Verification) are now operating directly against the blockchain contracts deployed from Remix!
