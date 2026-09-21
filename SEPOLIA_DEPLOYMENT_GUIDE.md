# 👑 The Definitive Ethereum Sepolia Deployment & Multi-Role Verification Guide

**Project:** Blockchain-Based Public Grievance Tracking System  
**Target Blockchain:** Ethereum Sepolia Testnet (`Chain ID: 11155111`)  
**Deployment Tool:** [Remix IDE](https://remix.ethereum.org) + [MetaMask](https://metamask.io)

---

## 🛡️ The 5 Golden Rules (Read Before Starting)

1. ⚠️ **NEVER SWITCH METAMASK ACCOUNTS DURING DEPLOYMENT:**  
   Deploy all 5 contracts using the exact same wallet address (**Account A / Super Admin**). The deployer of `RoleManager` is automatically granted `DEFAULT_ADMIN_ROLE` and `SUPER_ADMIN_ROLE`.
2. ⚠️ **NEVER USE "REMIX VM" OR "GANACHE":**  
   In Remix, select **`Injected Provider - MetaMask`**. Ensure MetaMask displays **Sepolia (Chain ID: 11155111)**.
3. ⚠️ **NEVER PUT WALLET ADDRESSES IN CONTRACT SLOTS IN `.env`:**  
   Your `.env` contract variables must ONLY contain deployed **smart contract addresses** (`0x...`), never your personal MetaMask account address.
4. ⚠️ **DEPLOYMENT ALONE IS NOT ENOUGH — WIRING IS MANDATORY:**  
   The contracts are modular. If you do not execute the post-deployment wiring (Step 5), transactions like grievance submission or officer review will revert.
5. ⚠️ **RESTART VITE AFTER EDITING `.env`:**  
   Vite only reads `.env` variables at server boot. Always stop (`Ctrl + C`) and restart (`npm run dev`) after updating addresses.

---

## 📋 Deployment Quick-Fill Card

Print or keep this card open while deploying in Remix to record your live Sepolia addresses:

```env
# Sepolia Contract Addresses (Fill as you deploy):
VITE_ROLE_MANAGER_ADDRESS=0x________________________________________  (Step 1)
VITE_DEPARTMENT_MANAGER_ADDRESS=0x__________________________________  (Step 2)
VITE_GRIEVANCE_SYSTEM_ADDRESS=0x____________________________________  (Step 3)
VITE_ESCALATION_MANAGER_ADDRESS=0x__________________________________  (Step 4)
VITE_AUDIT_TRAIL_ADDRESS=0x_________________________________________  (Step 5)
```

---

## 👥 Multi-Role Test Accounts Strategy

To prove the on-chain Role-Based Access Control (RBAC) model, you will use **4 distinct MetaMask accounts**:

```
                       ┌──────────────────────────────────┐
                       │   ACCOUNT A (Super Admin)        │
                       │   0x9a93...4149 (~0.5+ ETH)      │
                       │   - Deploys & wires contracts    │
                       │   - Creates departments/roles    │
                       └─────────────────┬────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
     ┌───────────────────────────────┐       ┌───────────────────────────────┐
     │   ACCOUNT B (Dept Admin)      │       │   ACCOUNT D (Citizen)         │
     │   0xBBBB... (~0.02 ETH)       │       │   0xDDDD... (~0.02 ETH)       │
     │   - Manages Dept 1 roster     │       │   - Self-registers on-chain   │
     │   - Triages & assigns tickets │       │   - Submits grievances        │
     └───────────────┬───────────────┘       │   - Accepts/rejects resolution│
                     │                       └───────────────────────────────┘
                     ▼
     ┌───────────────────────────────┐
     │   ACCOUNT C (Officer)         │
     │   0xCCCC... (~0.02 ETH)       │
     │   - Assigned to Dept 1        │
     │   - Investigates & resolves   │
     └───────────────────────────────┘
```

| Account | Label | Minimum Balance | Purpose & Security Boundaries |
| :--- | :--- | :--- | :--- |
| **Account A** | **Super Admin** | `~0.5+ Sepolia ETH` | Deploys all 5 contracts, configures system, seeds master data. Cannot be restricted. |
| **Account B** | **Dept 1 Admin** | `~0.02 Sepolia ETH` | Manages Department 1. **Cannot** create departments or manage other departments. |
| **Account C** | **Grievance Officer**| `~0.02 Sepolia ETH` | Investigates tickets assigned to them in Dept 1. **Cannot** resolve unassigned tickets. |
| **Account D** | **Citizen** | `~0.02 Sepolia ETH` | Submits complaints, reviews resolutions. **Cannot** access admin or officer panels. |

*Tip: In MetaMask, click **Account List ➔ Add a new account** to create Accounts B, C, and D. Transfer 0.02 Sepolia ETH from Account A to B, C, and D for gas.*

---

## 🚀 Phase 1: Remix IDE Setup

1. Open **[Remix IDE](https://remix.ethereum.org)**.
2. In the **File Explorer** (`contracts/` folder), ensure you have:
   * `GrievanceTypes.sol` (Enums, structs, custom errors)
   * `IAuditTrail.sol` (Audit interface)
   * `RoleManager.sol`
   * `DepartmentManager.sol`
   * `GrievanceSystem.sol`
   * `EscalationManager.sol`
   * `AuditTrail.sol`
3. Click the **Solidity Compiler** icon on the left:
   * **Compiler Version:** `0.8.20`, `0.8.24`, or `0.8.28`
   * **Language:** Solidity
   * **EVM Version:** `default` or `cancun`
   * **Optimization:** Check **Enable optimization** (`200` runs)
   * Click **Compile contracts**. Ensure all contracts show green checkmarks.
4. Click the **Deploy & Run Transactions** icon:
   * **Environment:** Select **`Injected Provider - MetaMask`**
   * MetaMask will pop up. Confirm network shows **Sepolia (11155111)**.
   * Account selector must show **Account A** (`0x9a93...4149`).

---

## 🏗️ Phase 2: Sequential Contract Deployment

Deploy in this **exact order** (contracts depend on previous contract addresses):

```
Step 1: RoleManager (0 args)
           │
           ▼
Step 2: DepartmentManager(RoleManager)
           │
           ▼
Step 3: GrievanceSystem(RoleManager, DepartmentManager)
           │
           ▼
Step 4: EscalationManager(RoleManager, DepartmentManager, GrievanceSystem)
           │
           ▼
Step 5: AuditTrail(RoleManager)
```

---

### Step 1: Deploy `RoleManager`
* **Contract Dropdown:** Select `RoleManager - contracts/RoleManager.sol`
* **Constructor Arguments:** *None (leave blank)*
* **Action:** Click **Deploy (Transact)** ➔ Confirm in MetaMask.
* **Result:** Under *Deployed Contracts*, click the copy icon next to `RoleManager`.
* **Save:**
  ```text
  ROLE_MANAGER_ADDRESS = 0x...
  ```

---

### Step 2: Deploy `DepartmentManager`
* **Contract Dropdown:** Select `DepartmentManager - contracts/DepartmentManager.sol`
* **Constructor Arguments:** Expand the field next to Deploy:
  * `_roleManager` (address): Paste `ROLE_MANAGER_ADDRESS`
* **Action:** Click **Deploy (Transact)** ➔ Confirm in MetaMask.
* **Save:**
  ```text
  DEPARTMENT_MANAGER_ADDRESS = 0x...
  ```

---

### Step 3: Deploy `GrievanceSystem`
* **Contract Dropdown:** Select `GrievanceSystem - contracts/GrievanceSystem.sol`
* **Constructor Arguments:** Expand the fields:
  * `_roleManager` (address): Paste `ROLE_MANAGER_ADDRESS`
  * `_departmentManager` (address): Paste `DEPARTMENT_MANAGER_ADDRESS`
* **Action:** Click **Deploy (Transact)** ➔ Confirm in MetaMask.
* **Save:**
  ```text
  GRIEVANCE_SYSTEM_ADDRESS = 0x...
  ```

---

### Step 4: Deploy `EscalationManager`
* **Contract Dropdown:** Select `EscalationManager - contracts/EscalationManager.sol`
* **Constructor Arguments:** Expand the fields:
  * `_roleManager` (address): Paste `ROLE_MANAGER_ADDRESS`
  * `_departmentManager` (address): Paste `DEPARTMENT_MANAGER_ADDRESS`
  * `_grievanceSystem` (address): Paste `GRIEVANCE_SYSTEM_ADDRESS`
* **Action:** Click **Deploy (Transact)** ➔ Confirm in MetaMask.
* **Save:**
  ```text
  ESCALATION_MANAGER_ADDRESS = 0x...
  ```

---

### Step 5: Deploy `AuditTrail`
* **Contract Dropdown:** Select `AuditTrail - contracts/AuditTrail.sol`
* **Constructor Arguments:**
  * `_roleManager` (address): Paste `ROLE_MANAGER_ADDRESS`
* **Action:** Click **Deploy (Transact)** ➔ Confirm in MetaMask.
* **Save:**
  ```text
  AUDIT_TRAIL_ADDRESS = 0x...
  ```

---

## ⚙️ Phase 3: Mandatory Post-Deployment Wiring

> 🚨 **CRITICAL:** Perform all wiring calls in Remix using **Account A (Super Admin)**.  
> Each call is an on-chain transaction that must be confirmed in MetaMask.

```
                      AuditTrail
                          ▲
    ┌─────────────────────┼─────────────────────┬─────────────────────┐
    │                     │                     │                     │
RoleManager       DepartmentManager       GrievanceSystem     EscalationManager
                                                │
                                                ▼
                                        EscalationManager
```

### Part A: Authorize Writer Contracts in `AuditTrail`
In Remix, scroll down to **Deployed Contracts** and expand **`AuditTrail`**:
1. Find `setAuthorizedWriter`:
   * `writer`: Paste `ROLE_MANAGER_ADDRESS`
   * `authorized`: `true`
   * Click **transact** ➔ Confirm in MetaMask.
2. Call `setAuthorizedWriter` again:
   * `writer`: Paste `DEPARTMENT_MANAGER_ADDRESS`
   * `authorized`: `true`
   * Click **transact** ➔ Confirm in MetaMask.
3. Call `setAuthorizedWriter` again:
   * `writer`: Paste `GRIEVANCE_SYSTEM_ADDRESS`
   * `authorized`: `true`
   * Click **transact** ➔ Confirm in MetaMask.
4. Call `setAuthorizedWriter` again:
   * `writer`: Paste `ESCALATION_MANAGER_ADDRESS`
   * `authorized`: `true`
   * Click **transact** ➔ Confirm in MetaMask.

*(Optional sanity check: Call `isAuthorizedWriter` with each address; all 4 must return `true`)*.

---

### Part B: Connect `AuditTrail` to Business Contracts
1. Expand deployed **`RoleManager`**:
   * Locate `setAuditTrail` ➔ enter `AUDIT_TRAIL_ADDRESS` ➔ Click **transact** ➔ Confirm.
2. Expand deployed **`DepartmentManager`**:
   * Locate `setAuditTrail` ➔ enter `AUDIT_TRAIL_ADDRESS` ➔ Click **transact** ➔ Confirm.
3. Expand deployed **`GrievanceSystem`**:
   * Locate `setAuditTrail` ➔ enter `AUDIT_TRAIL_ADDRESS` ➔ Click **transact** ➔ Confirm.
4. Expand deployed **`EscalationManager`**:
   * Locate `setAuditTrail` ➔ enter `AUDIT_TRAIL_ADDRESS` ➔ Click **transact** ➔ Confirm.

---

### Part C: Connect `EscalationManager` into `GrievanceSystem`
In Remix, expand deployed **`GrievanceSystem`**:
* Locate `setEscalationManager`:
  * `_escalationManager`: Paste `ESCALATION_MANAGER_ADDRESS`
  * Click **transact** ➔ Confirm in MetaMask.

✅ **All 5 contracts are now fully integrated and operational!**

---

## 💻 Phase 4: Configure Frontend `.env`

Open [`frontend/.env`](file:///d:/Grievense/frontend/.env) and replace the address placeholders with your actual deployed addresses:

```env
# Smart Contract Deployed Addresses on Sepolia
VITE_ROLE_MANAGER_ADDRESS=0x<Your_RoleManager_Address>
VITE_DEPARTMENT_MANAGER_ADDRESS=0x<Your_DepartmentManager_Address>
VITE_GRIEVANCE_SYSTEM_ADDRESS=0x<Your_GrievanceSystem_Address>
VITE_ESCALATION_MANAGER_ADDRESS=0x<Your_EscalationManager_Address>
VITE_AUDIT_TRAIL_ADDRESS=0x<Your_AuditTrail_Address>

# Target Chain Configuration
VITE_CHAIN_ID=11155111
VITE_TARGET_CHAIN_ID=11155111
VITE_NETWORK_NAME=Sepolia

# Public Sepolia Read-Only RPC for Verification (No wallet needed)
VITE_RPC_URL=https://rpc.sepolia.org
VITE_EXPLORER_URL=https://sepolia.etherscan.io
```

### Restart the Vite Dev Server:
In your terminal where the frontend is running:
1. Press `Ctrl + C` to stop the server.
2. Start it fresh:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173`. In the header, confirm:
   * Network badge: `Sepolia`
   * Contract status: `All 5 Contracts Configured` (Green status)

---

## 🌱 Phase 5: Initial Data Seeding (Roles & Department)

You can seed these directly via Remix using **Account A (Super Admin)**:

### 1. Grant Roles in `RoleManager`
In Remix, under `RoleManager`:
* Call `grantDepartmentAdminRole`:
  * `account`: Paste Account B address (`0xBBBB...`) ➔ Click **transact** ➔ Confirm.
* Call `grantOfficerRole`:
  * `account`: Paste Account C address (`0xCCCC...`) ➔ Click **transact** ➔ Confirm.

### 2. Create Initial Department in `DepartmentManager`
In Remix, under `DepartmentManager`:
* Call `createDepartment`:
  * `name`: `"Sanitation & Public Works"`
  * `admin`: Paste Account B address (`0xBBBB...`)
  * Click **transact** ➔ Confirm.  
  *(This creates **Department ID: 1** with Account B as Admin)*

### 3. Create Categories in `DepartmentManager`
In Remix, under `DepartmentManager`:
* Call `createCategory`:
  * `name`: `"Road & Pothole Repair"`
  * `description`: `"Reporting potholes and hazardous surface defects"`
  * Click **transact** ➔ Confirm. *(Category ID: 1)*
* Call `createCategory`:
  * `name`: `"Water Supply & Drainage"`
  * `description`: `"Contaminated water, burst mains, sewage backup"`
  * Click **transact** ➔ Confirm. *(Category ID: 2)*

### 4. Assign Officer to Department
In Remix, under `DepartmentManager`:
* Call `addOfficerToDepartment`:
  * `departmentId`: `1`
  * `officer`: Paste Account C address (`0xCCCC...`)
  * Click **transact** ➔ Confirm.

---

## 🧪 Phase 6: End-to-End Verification Test (Full Lifecycle)

Open `http://localhost:5173` and follow the lifecycle walkthrough:

```
  CITIZEN (Acct D)               DEPT ADMIN (Acct B)             OFFICER (Acct C)
         │                                │                              │
  1. Submit Grievance ───────────────────►│                              │
     (Status: SUBMITTED)                  │                              │
                                   2. Assign Officer ───────────────────►│
                                      (Status: ASSIGNED)                 │
                                                                   3. Start Review
                                                                      (Status: UNDER_REVIEW)
                                                                         │
                                                                   4. Start Investigation
                                                                      (Status: INVESTIGATING)
                                                                         │
                                                                   5. Submit Resolution
                                   ◄─────────────────────────────────────┘
  6. Review Resolution
     (Status: RESOLVED)
          │
      [ACCEPT] ──► (Status: CLOSED)
```

### Step 1: Citizen Registers & Files Grievance
1. In MetaMask, switch to **Account D (Citizen)**.
2. Go to `http://localhost:5173` and click **Connect Wallet**.
3. If prompted, click **Register as Citizen** (calls `RoleManager.registerCitizen()`).
4. Click **Submit Grievance**:
   * Department: `Sanitation & Public Works` (ID `1`)
   * Category: `Road & Pothole Repair` (ID `1`)
   * Title: `Hazardous pothole on 5th Avenue`
   * Description: `Deep pothole causing traffic obstruction and vehicle damage.`
   * Priority: `HIGH`
5. Click **Submit Grievance** ➔ Confirm in MetaMask.
6. Note the returned **Grievance ID** (e.g. `1`). Status is **`SUBMITTED`**.

---

### Step 2: Department Admin Assigns Officer
1. Switch MetaMask to **Account B (Dept Admin)**.
2. Refresh the browser. The UI automatically displays the **Department Admin Dashboard**.
3. Locate Grievance #1 under the *New / Submitted* tab.
4. Click **Assign Officer**:
   * Select Account C (`0xCCCC...`) from the roster.
   * Click **Confirm Assignment** ➔ Sign in MetaMask.
5. Status updates to **`ASSIGNED`**.

---

### Step 3: Officer Investigates & Resolves
1. Switch MetaMask to **Account C (Officer)**.
2. Refresh the browser. The UI automatically opens the **Officer Portal**.
3. Click on Grievance #1:
   * Click **Start Review** ➔ Sign transaction ➔ Status: **`UNDER_REVIEW`**.
   * Click **Start Investigation** ➔ Sign transaction ➔ Status: **`INVESTIGATING`**.
   * Enter an Investigation Note (e.g., *"Inspected site with maintenance crew; hot-mix asphalt required"*).
   * Click **Submit Resolution**:
     * Resolution: *"Pothole repaired and leveled with high-grade bituminous mix. Traffic restored."*
     * Evidence IPFS hash: *(Optional)*
     * Sign transaction in MetaMask.
4. Status updates to **`RESOLVED`**.

---

### Step 4: Citizen Accepts Resolution
1. Switch MetaMask back to **Account D (Citizen)**.
2. Refresh the browser ➔ Go to **Citizen Portal** ➔ **My Grievances**.
3. Click on Grievance #1.
4. Read the officer's resolution details.
5. Click **Accept Resolution** ➔ Confirm in MetaMask.
6. Status updates to **`CLOSED`**. Lifecycle complete!

---

### Step 5: Public Forensic Verification (Zero-Wallet Audit)
1. Open a new Incognito browser window (or disconnect MetaMask).
2. Navigate to `http://localhost:5173/verification`.
3. Enter Grievance ID `1` and click **Verify On-Chain**.
4. The system queries the public Sepolia RPC directly and displays:
   * Complete cryptographic audit log from `AuditTrail.sol`
   * Exact blocks and timestamps for every transition:
     `SUBMITTED ➔ ASSIGNED ➔ UNDER_REVIEW ➔ INVESTIGATING ➔ RESOLVED ➔ CLOSED`
   * Transacting addresses and verification proof.

---

## 🔒 Security & RBAC Invariant Checks

Test and verify on-chain enforcement by trying these unauthorized actions:

| Attempted Action | Actor Attempting | Expected Behavior |
| :--- | :--- | :--- |
| Create Department | Citizen (D) or Officer (C) | ❌ **Reverts:** Caller lacks `SUPER_ADMIN_ROLE` |
| Assign Officer | Citizen (D) or Officer (C) | ❌ **Reverts:** Caller lacks `DEPT_ADMIN_ROLE` |
| Submit Resolution | Citizen (D) or Dept Admin (B) | ❌ **Reverts:** Caller is not the assigned officer |
| Accept/Reject Resolution | Officer (C) or Dept Admin (B) | ❌ **Reverts:** Caller is not the grievance submitter |
| Modify Audit Records | Any account (even Super Admin) | ❌ **Reverts:** `AuditTrail` is append-only; no edit/delete functions exist |

---

## 🛠️ Troubleshooting Guide

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **"Missing Role" or execution reverted in MetaMask** | Transaction initiated with the wrong account | Switch MetaMask to the appropriate role account (Account A for admin tasks, C for officer tasks). |
| **Audit log transaction reverts during submit/resolve** | Writer contracts not authorized in `AuditTrail` | Complete **Phase 3, Part A**: call `setAuthorizedWriter` on `AuditTrail` for all 4 contracts. |
| **Frontend displays "Contracts Not Configured"** | `.env` not updated or Vite dev server was not restarted | Update addresses in `frontend/.env` and restart Vite (`Ctrl + C` ➔ `npm run dev`). |
| **"SLA not breached" when clicking Escalate** | SLA deadline has not passed yet | Escalation requires real time to elapse (`block.timestamp > slaDeadline`). Cannot escalate before deadline. |
| **Gas estimation error in MetaMask** | Contract call will fail due to a require/revert check | Review error parameters. Verify active wallet matches expected role in `RoleManager`. |
