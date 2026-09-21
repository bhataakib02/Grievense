# Blockchain-Based Public Grievance Tracking System — Frontend Foundation

This is the decentralized frontend application for the **Blockchain-Based Public Grievance Tracking System**. Built with **React 19**, **Vite 8**, **Tailwind CSS v4**, and **Ethers.js v6**, interfacing directly with Ethereum smart contracts without centralized backends.

---

## Architecture Overview

- **Direct Blockchain Interaction**: The frontend connects to the EVM node via the user's browser wallet (`window.ethereum` / MetaMask).
- **Zero Centralized Backend**: No Node/Express, Python/FastAPI, MongoDB, Firebase, or Supabase. All state and authorization reside on-chain.
- **Contract ABIs**: Compiled directly from solc 0.8.28 build artifacts located in `src/contracts/abis/`.
- **Role Detection Foundation**: Prepares integration with `RoleManager.sol` for role-based navigation and permissions.

---

## Prerequisites

- **Node.js**: v18.0.0 or later (v22 recommended)
- **Browser Wallet**: MetaMask or compatible EIP-1193 browser extension

---

## Installation & Setup

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your local environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure smart contract addresses in `.env` (once contracts are deployed):
   ```env
   VITE_ROLE_MANAGER_ADDRESS=
   VITE_DEPARTMENT_MANAGER_ADDRESS=
   VITE_GRIEVANCE_SYSTEM_ADDRESS=
   VITE_ESCALATION_MANAGER_ADDRESS=
   VITE_AUDIT_TRAIL_ADDRESS=
   VITE_TARGET_CHAIN_ID=1337
   ```

---

## Running the Application

### Development Server
```bash
npm run dev
```
Starts the Vite dev server (typically at `http://localhost:5173`).

### Production Build
```bash
npm run build
```
Generates production assets in `dist/`.

### Preview Production Build
```bash
npm run preview
```

---

## Project Structure

```text
frontend/
├── .env.example                 # Template for deployed contract addresses
├── .gitignore                   # Ignores .env, .env.local, node_modules, dist
├── index.html                   # HTML entry point with system metadata
├── package.json                 # Frontend dependencies (React, Vite, Ethers, Tailwind)
├── vite.config.js               # Vite configuration with @tailwindcss/vite
├── src/
│   ├── main.jsx                 # React root renderer
│   ├── App.jsx                  # Main application shell with WalletProvider
│   ├── index.css                # Tailwind CSS v4 entry point
│   ├── components/
│   │   ├── common/              # Reusable UI components (Button, Card, Badge, Alert)
│   │   ├── wallet/              # ConnectButton and wallet state dropdown
│   │   └── blockchain/          # ContractStatusCard and contract status table
│   ├── context/
│   │   └── WalletContext.jsx    # Ethers v6 browser wallet provider & state
│   ├── hooks/
│   │   ├── useWallet.js         # Hook for wallet state and connection
│   │   └── useContract.js       # Hook for contract instances and deployment status
│   ├── layouts/
│   │   ├── Header.jsx           # Portal header with network indicator & wallet trigger
│   │   ├── Footer.jsx           # Public-service transparency footer
│   │   └── MainLayout.jsx       # Responsive page container
│   ├── pages/
│   │   └── LandingPage.jsx      # Portal landing page & system overview
│   ├── services/
│   │   ├── blockchain.js        # Ethers.js contract instance factory
│   │   └── wallet.js            # Provider detection & EIP-1193 error handling
│   ├── contracts/
│   │   ├── addresses.js         # Contract address resolver & validator
│   │   └── abis/                # Exact solc build artifact ABIs:
│   │       ├── RoleManager.json
│   │       ├── DepartmentManager.json
│   │       ├── GrievanceSystem.json
│   │       ├── EscalationManager.json
│   │       └── AuditTrail.json
│   └── utils/
│       └── formatters.js        # Address shortening, chain name mapping, date formatting
```

---

## Current Status (Step 10 — Frontend Foundation)

- ✅ React + Vite + Tailwind CSS v4 environment initialized and building cleanly.
- ✅ Ethers.js v6 browser wallet detection (`window.ethereum`) with account/network change listeners.
- ✅ All 5 smart-contract ABIs extracted from actual build artifacts without modifications.
- ✅ Responsive public-service design system (Header, Footer, Landing Page, Status Cards).
- ✅ Graceful unconfigured-contract state ("Contracts Not Configured" banner when `.env` is empty).
- ⏳ *Step 11 onward*: Role-specific dashboards (Citizen, Officer, Department Admin, Super Admin) and smart-contract transaction workflows.
