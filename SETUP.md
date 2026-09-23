# Blockchain-Based Public Grievance Tracking System
## Complete Setup & Startup Guide

This document is the authoritative, step-by-step operating manual for the **Blockchain-Based Public Grievance Tracking System**.

Whether you are setting up the project on a **completely new system for the first time** or **starting up daily development**, follow this guide to ensure operational integrity and avoid corrupting the on-chain or off-chain state.

---

## Table of Contents
- [Core Architecture & Authoritative Source of Truth](#core-architecture--authoritative-source-of-truth)
- [Canonical Ethereum Sepolia Deployment Configuration](#canonical-ethereum-sepolia-deployment-configuration)
- [Part A — First-Time Setup on a New Computer](#part-a--first-time-setup-on-a-new-computer)
- [Part B — Normal Startup (Every Later Time)](#part-b--normal-startup-every-later-time)
- [Part C — Critical Rules: What NOT to Do](#part-c--critical-rules-what-not-to-do)
- [Part D — Comprehensive Troubleshooting Manual](#part-d--comprehensive-troubleshooting-manual)
- [Part E — Verification Checklist for New Team Members](#part-e--verification-checklist-for-new-team-members)

---

## Core Architecture & Authoritative Source of Truth

The system implements a hybrid on-chain / off-chain architecture designed for decentralization, cryptographic verifiability, and sub-second query performance:

```
                    ┌─────────────────────────┐
                    │  Citizen / Officer /    │
                    │   Department Admin /    │
                    │      Super Admin        │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ React + Vite DApp (UI)  │
                    │  http://localhost:5173  │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼                               ▼
       ┌──────────────────┐            ┌───────────────────┐
       │ Ethers.js v6     │            │ FastAPI Backend   │
       │ + MetaMask       │            │ http://localhost: │
       └─────────┬────────┘            │       8000        │
                 │                     └─────────┬─────────┘
                 │ (Direct RPC writes            │
                 │  & authoritative fallback)    ├───────────────┐
                 ▼                               ▼               ▼
       ┌──────────────────┐            ┌──────────────────┐┌───────────┐
       │ Ethereum Sepolia │◄───────────┤ Resilient Indexer││  Pinata   │
       │ (Chain 11155111) │  (Scans    │ & Supabase Cache ││   IPFS    │
       │   AUTHORITATIVE  │   Events)  └──────────────────┘└───────────┘
       └──────────────────┘
```

### The Golden Rule of State
> **Ethereum Sepolia is the sole, authoritative source of truth for all blockchain identities, grievances, role authorizations, and audit entries.**
> 
> * **Supabase** is a read-accelerating off-chain cache and event index.
> * **Pinata IPFS** stores large content payloads (evidence attachments, resolution summaries) referenced by cryptographic content identifiers (CIDs) and keccak256 hashes on-chain.
> * If Supabase and Ethereum ever diverge, **Ethereum wins**. Run `POST /api/reconcile` to re-align Supabase automatically.

---

## Canonical Ethereum Sepolia Deployment Configuration

All team members must use the existing, verified Sepolia smart contracts. **Do not redeploy or change these addresses.**

| Contract | Canonical Sepolia Address | Role / Responsibility |
| :--- | :--- | :--- |
| **`RoleManager`** | `0x7F362356f84dfc02478aAB2d2524aaD7a342D7e0` | Global RBAC, Super Admin, Dept Admin, Officer roles |
| **`DepartmentManager`** | `0xE06A89c411CEd09f1cE9Cbebb08ddCC4013aCD7B` | Department registry, Category registry, Officer rosters |
| **`GrievanceSystem`** | `0x4435C4Aa0Ca20a9651a8408Cff48380201777933` | Core grievance intake, lifecycle state machine, resolutions |
| **`EscalationManager`** | `0xB990B5b4955A07153111B7b5B532575deEc1e466` | Priority-based SLA deadlines, breach detection & reallocations |
| **`AuditTrail`** | `0x7bFD42cD030CBc691ebB52592e0b7c3789117288` | Append-only cryptographic ledger of all lifecycle events |

* **Network**: Ethereum Sepolia
* **Chain ID**: `11155111`
* **Deployment Version**: `2.1.0`
* **Deployment Start Block**: `11764100`

---

## Part A — First-Time Setup on a New Computer

Follow these 25 sequential steps when onboarding a clean development machine.

### 1. System Requirements
- **OS**: Windows 10/11, macOS, or Ubuntu 20.04+ (PowerShell or Bash shell)
- **Node.js**: `v18.0.0` or higher (Node 20+ recommended)
- **Python**: `v3.10.x` or `v3.11.x`
- **Memory**: Minimum 8 GB RAM

### 2. Install Git
Verify or install Git from [git-scm.com](https://git-scm.com/):
```bash
git --version
# Expected: git version 2.x.x
```

### 3. Install Node.js & npm
Verify or install Node.js (LTS) from [nodejs.org](https://nodejs.org/):
```bash
node -v
npm -v
# Expected: node v18+ / v20+ and npm 9+ / 10+
```

### 4. Install Python & pip
Verify or install Python from [python.org](https://www.python.org/downloads/):
```bash
python --version
pip --version
# Expected: Python 3.10.x or 3.11.x
```

### 5. Install MetaMask Browser Extension
1. Install [MetaMask](https://metamask.io/) in Chrome, Brave, or Firefox.
2. In MetaMask Settings $\rightarrow$ Advanced, toggle **"Show test networks"** to **ON**.
3. Select **Sepolia** network.
4. Fund your account with testnet ETH via a Sepolia faucet (e.g., [sepoliafaucet.com](https://sepoliafaucet.com/)).

### 6. Clone the Repository
```bash
git clone https://github.com/your-org/Grievense.git
cd Grievense
```

### 7. Configure Environment Files (`.env`)

#### A. Frontend `.env`
Create `frontend/.env`:
```env
# Target Network: Ethereum Sepolia (Chain ID: 11155111)
VITE_ROLE_MANAGER_ADDRESS=0x7F362356f84dfc02478aAB2d2524aaD7a342D7e0
VITE_DEPARTMENT_MANAGER_ADDRESS=0xE06A89c411CEd09f1cE9Cbebb08ddCC4013aCD7B
VITE_GRIEVANCE_SYSTEM_ADDRESS=0x4435C4Aa0Ca20a9651a8408Cff48380201777933
VITE_ESCALATION_MANAGER_ADDRESS=0xB990B5b4955A07153111B7b5B532575deEc1e466
VITE_AUDIT_TRAIL_ADDRESS=0x7bFD42cD030CBc691ebB52592e0b7c3789117288

VITE_CHAIN_ID=11155111
VITE_TARGET_CHAIN_ID=11155111
VITE_NETWORK_NAME=Sepolia

VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_EXPLORER_URL=https://sepolia.etherscan.io

VITE_IPFS_API_URL=http://localhost:8000/api/ipfs
VITE_IPFS_UPLOAD_URL=http://localhost:8000/api/ipfs/upload
VITE_IPFS_GATEWAY_URL=https://ipfs.io
```

#### B. Backend `.env`
Create `backend/.env`:
```env
# Blockchain Configuration
CHAIN_ID=11155111
NETWORK_NAME=sepolia
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
DEPLOYMENT_START_BLOCK=11764100
DEPLOYMENT_VERSION=2.1.0

# Authoritative Sepolia Contract Addresses
ROLE_MANAGER_ADDRESS=0x7F362356f84dfc02478aAB2d2524aaD7a342D7e0
DEPARTMENT_MANAGER_ADDRESS=0xE06A89c411CEd09f1cE9Cbebb08ddCC4013aCD7B
GRIEVANCE_SYSTEM_ADDRESS=0x4435C4Aa0Ca20a9651a8408Cff48380201777933
ESCALATION_MANAGER_ADDRESS=0xB990B5b4955A07153111B7b5B532575deEc1e466
AUDIT_TRAIL_ADDRESS=0x7bFD42cD030CBc691ebB52592e0b7c3789117288

# Hosted Supabase Credentials
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here

# Pinata IPFS Service Configuration
PINATA_JWT=your-pinata-jwt-key-here
PINATA_GATEWAY=https://gateway.pinata.cloud

HOST=0.0.0.0
PORT=8000
```

### 8. Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

### 9. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 10. Configure Supabase Schema (First Time Only)
1. Log into your project on [supabase.com](https://supabase.com).
2. Open the **SQL Editor**.
3. Open `backend/migrations/001_deployment_aware_schema.sql` in your editor, copy the entire SQL script, and click **Run**.
4. Confirm that the following tables exist in the **Table Editor**:
   - `deployments`
   - `departments`
   - `categories`
   - `officers`
   - `grievances`
   - `grievance_events`
   - `audit_events`
   - `indexer_state`
   - `ipfs_objects`

### 11. Verify Supabase Connection
Run a quick test script to confirm credentials and connection:
```bash
python -c "
import sys; sys.path.insert(0, 'backend')
from app.db.supabase import get_supabase_client
client = get_supabase_client()
print('Supabase connected successfully!' if client else 'FAILED to connect to Supabase')
"
```

### 12. Verify Sepolia RPC Configuration
Confirm public RPC accessibility:
```bash
curl -X POST https://ethereum-sepolia-rpc.publicnode.com \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected response: {"jsonrpc":"2.0","id":1,"result":"0xaa36a7"} (11155111 in hex)
```

### 13. Verify Contract Addresses On-Chain
Run this command to check bytecode existence at the deployed addresses:
```bash
node -e "
const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const addrs = [
  '0x7F362356f84dfc02478aAB2d2524aaD7a342D7e0',
  '0xE06A89c411CEd09f1cE9Cbebb08ddCC4013aCD7B',
  '0x4435C4Aa0Ca20a9651a8408Cff48380201777933',
  '0xB990B5b4955A07153111B7b5B532575deEc1e466',
  '0x7bFD42cD030CBc691ebB52592e0b7c3789117288'
];
Promise.all(addrs.map(a => provider.getCode(a))).then(codes => {
  const allDeployed = codes.every(c => c && c !== '0x');
  console.log('All 5 Sepolia contracts verified on-chain:', allDeployed);
});
"
```

### 14. Verify IPFS Service
Test Pinata credentials:
```bash
python -c "
import sys; sys.path.insert(0, 'backend')
from app.services.ipfs_service import upload_json_to_pinata
try:
    res = upload_json_to_pinata({'test': 'ping'})
    print('IPFS Pinata operational, test CID:', res['cid'])
except Exception as e:
    print('IPFS Warning:', e)
"
```

### 15. Start Backend Service
Open **Terminal 1**:
```bash
cd backend
uvicorn app.main:app --reload
```
Look for:
```text
INFO: Successfully connected to Supabase PostgreSQL index.
INFO: Initializing blockchain indexer and deployment registry...
INFO: Uvicorn running on http://127.0.0.1:8000
```

### 16. Start Frontend Application
Open **Terminal 2**:
```bash
cd frontend
npm run dev
```
Look for:
```text
  VITE v8.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

### 17. Connect MetaMask
1. Open Chrome/Brave and navigate to `http://localhost:5173`.
2. Click **Connect Wallet** in the top navigation bar.
3. Select your account and approve connection in MetaMask.

### 18. Select Sepolia Network
Ensure MetaMask displays **Sepolia** (Chain ID `11155111`). If on Mainnet or another network, the DApp displays a warning banner prompting you to switch.

### 19. Test Role Detection
The frontend automatically inspects `RoleManager` on-chain for the connected address:
- If connected as Super Admin (`0xeae...`): Console shows Super Admin tabs.
- If connected as Dept Admin: Shows Department Admin dashboard.
- If connected as Officer (`0xCc3...`): Shows Officer console.
- If connected as Citizen: Shows Citizen grievance lodge/tracking portal.

### 20. Test Blockchain Read
Navigate to **Public Verification** (`/verify`). Department #1 and Category #1 should load immediately.

### 21. Run Initial On-Chain State Sync
In a terminal, trigger an on-chain reconciliation pass:
```bash
curl -X POST http://127.0.0.1:8000/api/reconcile
```
Expected output:
```json
{
  "success": true,
  "deployment_id": 1,
  "scanned": { "departments": 1, "categories": 1, "grievances": 2 },
  "repaired": { "departments": 0, "categories": 0, "grievances": 0 },
  "discrepancies": [],
  "clean": true
}
```

### 22. Verify Indexer Status
```bash
curl http://127.0.0.1:8000/api/indexer/status
```
`connected: true` and `isRunning: true` must be returned.

### 23. Verify Supabase Cache Endpoint
```bash
curl http://127.0.0.1:8000/api/cached/departments
curl http://127.0.0.1:8000/api/cached/grievances
```
Both return `success: true` and indexed counts.

### 24. Verify Production Build
```bash
cd frontend
npm run lint
npm run build
cd ..
```
Must pass with 0 errors.

### 25. First-Time Setup Complete!
Your local machine is now fully integrated with Ethereum Sepolia, Supabase, and IPFS.

---

## Part B — Normal Startup (Every Later Time)

After initial setup is done, **do NOT repeat installation or migrations**. Simply run these steps:

### Quick Startup Checklist
1. Open the project root folder in your terminal or IDE.
2. **Terminal 1**: Start Backend
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```
3. **Terminal 2**: Start Frontend
   ```bash
   cd frontend
   npm run dev
   ```
4. Open your browser at `http://localhost:5173`.
5. Connect MetaMask (ensure network is **Sepolia**).
6. Verify backend health at `http://localhost:8000/api/health`.

### Application URLs & Ports
- **Frontend DApp**: `http://localhost:5173`
- **Backend API Docs (Swagger)**: `http://localhost:8000/docs`
- **Backend Health Check**: `http://localhost:8000/api/health`
- **Indexer Status**: `http://localhost:8000/api/indexer/status`

---

## Part C — Critical Rules: What NOT to Do

To maintain safety and protect deployed smart contracts and database tables:

```text
🛑 STRICT PROHIBITIONS DURING NORMAL STARTUP:

❌ DO NOT run `npm install` every time. (Only run when package.json dependencies change).
❌ DO NOT reinstall Python packages every time.
❌ DO NOT re-run SQL migrations (`001_deployment_aware_schema.sql`) on Supabase.
❌ DO NOT compile Solidity or run deployment scripts during daily startup.
❌ DO NOT deploy new contracts or replace contract addresses in .env.
❌ DO NOT reset or wipe blockchain state.
❌ DO NOT delete or truncate Supabase tables.
❌ DO NOT edit contract ABIs manually.
❌ DO NOT switch networks away from Sepolia in MetaMask while interacting with the DApp.
```

---

## Part D — Comprehensive Troubleshooting Manual

| Problem | Check | Diagnostic Command | Expected Result | Solution / Fix |
| :--- | :--- | :--- | :--- | :--- |
| **Backend won't start** | Missing `.env` or Python packages | `python -m pip list` | `fastapi`, `uvicorn`, `supabase` present | Run `pip install -r requirements.txt` and ensure `backend/.env` exists |
| **Port 8000 already in use** | Stray uvicorn or python process running | `netstat -ano \| findstr :8000` (Windows) or `lsof -i :8000` (macOS/Linux) | Single PID listening | Kill the orphan process: `taskkill /PID <PID> /F` (Windows) or `kill -9 <PID>` |
| **Frontend won't start** | Node modules missing or port 5173 bound | `npm -v` | Node modules loaded | Run `npm install` once or specify another port: `npx vite --port 5174` |
| **MetaMask wrong network** | Chain ID banner in UI | Inspect MetaMask top-left network pill | `Sepolia` selected | Click network selector in MetaMask $\rightarrow$ Choose **Sepolia** |
| **Contract bytecode missing** | Network RPC issue or wrong address | `curl http://localhost:8000/api/health` | `"status": "ok"` | Ensure `.env` has canonical addresses and `VITE_RPC_URL` is responsive |
| **Transaction reverted with `0xdaa19ee1`** | Attempting illegal status transition | Check grievance status before submitting | `InvalidStatusTransition` | Follow valid lifecycle: REOPENED grievances must be assigned by Admin before review/investigation |
| **Supabase offline / fallback active** | Supabase credentials or network down | `curl http://localhost:8000/api/health` | `"supabase": {"configured": true, "online": true}` | Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` |
| **Indexer stopped** | Background task crashed or connection failed | `curl http://localhost:8000/api/indexer/status` | `"isRunning": true` | Restart uvicorn (`Terminal 1`). Indexer resumes from last saved checkpoint block |
| **IPFS upload fails** | Expired Pinata JWT or gateway timeout | Inspect `backend/.env` `PINATA_JWT` | Valid JWT string | Update `PINATA_JWT` in `backend/.env` or verify network connection to Pinata |
| **Frontend shows empty grievances** | Supabase cache empty or indexing pass pending | `curl -X POST http://localhost:8000/api/reconcile` | `"scanned": {...}, "clean": true` | Trigger reconcile endpoint. Frontend also automatically falls back to direct Sepolia contract reads |

---

## Part E — Verification Checklist for New Team Members

Before claiming onboarding is complete, verify all items:

- [ ] `git status` is clean (no modified contract addresses).
- [ ] `http://localhost:8000/api/health` returns:
  ```json
  {
    "status": "ok",
    "chainId": 11155111,
    "network": "sepolia",
    "supabase": { "configured": true, "online": true },
    "indexer": { "connected": true }
  }
  ```
- [ ] `http://localhost:8000/api/cached/departments` returns Department #1 (`Health care`).
- [ ] `http://localhost:8000/api/cached/grievances` returns indexed grievances.
- [ ] Frontend builds cleanly with zero errors: `npm run build`.
- [ ] MetaMask connects to `http://localhost:5173` on Sepolia.
- [ ] Public Verification page (`/verify`) displays on-chain departments and categories.
