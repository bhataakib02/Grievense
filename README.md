# Blockchain-Based Public Grievance Tracking System

## Project Name
**Blockchain-Based Public Grievance Tracking System**

## Purpose
A decentralized, transparent, and tamper-proof public grievance lifecycle management DApp built on an Ethereum-compatible EVM blockchain. The system enforces strict administrative accountability, role-based workflows, verifiable service level agreements (SLAs), and citizen empowerment.

## Core Architecture

```
React (Frontend)
       ↓
   Ethers.js
       ↓
    MetaMask
       ↓
Solidity Smart Contracts
       ↓
  EVM Blockchain
```

> **CRITICAL PRINCIPLE:**
> The blockchain is the sole authoritative source of truth. All user roles, departments, grievances, status transitions, assignments, investigation notes/records, escalation triggers, and audit trails are recorded immutably on-chain. There is no traditional centralized database or backend API pretending to be a blockchain.

---

## Deployment & Testing Guides

* 🚀 **[Ethereum Sepolia Deployment & Multi-Role Testing Guide](file:///d:/Grievense/SEPOLIA_DEPLOYMENT_GUIDE.md)**: Complete step-by-step instructions for deploying via Remix + MetaMask, configuring `.env`, wiring contracts, multi-account setup (4 roles), and running end-to-end lifecycle verification.
* 🛠️ **[Remix IDE Deployment Reference](file:///d:/Grievense/REMIX_DEPLOYMENT.md)**: Technical reference for contract compilation settings and post-deployment wiring.


---

## Planned Smart Contracts

### Contracts (`contracts/`)
* **`GrievanceTypes.sol`**: Shared data structures, enums, constants, and custom error types.
* **`RoleManager.sol`**: Multi-tiered role-based access control (Citizen, Officer, Department Admin, Super Admin).
* **`DepartmentManager.sol`**: Department registry, administrator assignments, and officer roster management.
* **`GrievanceSystem.sol`**: Core grievance registration, assignment, review, investigation, resolution, and lifecycle enforcement.
* **`EscalationManager.sol`**: SLA monitoring, deadline calculations, and automated/manual escalation handling.
* **`AuditTrail.sol`**: Immutable audit logs, historical tracking, and comprehensive on-chain event emission.

### Interfaces (`interfaces/`)
* `IRoleManager.sol`
* `IDepartmentManager.sol`
* `IGrievanceSystem.sol`
* `IEscalationManager.sol`
* `IAuditTrail.sol`

### Libraries (`libraries/`)
* `GrievanceLib.sol`
* `ValidationLib.sol`

---

## Development Environment & Tooling

* **Solidity / Smart Contracts**: Solidity `^0.8.20`, directly compilable and deployable in **Remix IDE**.
* **Blockchain Runtime**: Ethereum-compatible EVM network (Local/Testnet/Mainnet).
* **Frontend**: React + Vite + Tailwind CSS + React Router (institutional and public-service UI).
* **Web3 Integration**: Ethers.js communicating directly with EVM nodes via MetaMask.
* **Wallet Authentication**: MetaMask signing user transactions (wallet address = on-chain identity; zero private keys stored).
* **Evidence Storage**: Decentralized storage via IPFS (content CID stored on-chain for evidence references).

---

## Project Structure

```
.
├── contracts/        # Solidity smart contracts (Remix-ready)
├── interfaces/       # Smart contract interfaces
├── libraries/        # Reusable Solidity libraries
├── tests/            # Automated test suites
├── frontend/         # React + Vite web application (to be initialized)
├── docs/             # Technical specifications and architectural docs
│   └── architecture.md
├── README.md         # Project overview
└── .gitignore        # Git ignore specifications
```
