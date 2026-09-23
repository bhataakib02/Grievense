/**
 * ===================================================================
 * ETHEREUM SEPOLIA CONTRACT DEPLOYMENT & MIGRATION RUNNER
 * Target Network: Ethereum Sepolia (Chain ID: 11155111)
 *
 * PRODUCTION-GRADE DEPLOYMENT SAFETY RULES:
 * 1. NEVER silently redeploy or overwrite live Sepolia contracts.
 * 2. Before deployment, automatically inspects existing contract bytecode and state counts.
 * 3. Creates an immutable pre-deployment state snapshot in backups/sepolia/.
 * 4. Displays prominent storage-wipe warnings explaining EVM storage independence.
 * 5. Strictly requires explicit confirmation string: 'CONFIRM_SEPOLIA_FRESH_DEPLOYMENT'.
 * 6. Never exposes or logs private keys.
 * 7. Records deployment history in deployments/sepolia/history/ and updates latest.json.
 * ===================================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ethers } = require('ethers');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const FRONTEND_ENV = path.join(__dirname, '..', 'frontend', '.env');
const DEPLOYMENTS_DIR = path.join(__dirname, '..', 'deployments', 'sepolia');
const HISTORY_DIR = path.join(DEPLOYMENTS_DIR, 'history');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups', 'sepolia');

const REQUIRED_CONFIRMATION_STRING = 'CONFIRM_SEPOLIA_FRESH_DEPLOYMENT';

function loadArtifact(name) {
  const filePath = path.join(BUILD_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact ${name}.json not found in build/ directory. Run 'node scripts/compile.js' first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
      }
    }
  }
  return env;
}

async function askConfirmationPrompt(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('============================================================');
  console.log('       SEPOLIA PRODUCTION DEPLOYMENT SAFETY RUNNER');
  console.log('============================================================\n');

  const env = parseEnv(FRONTEND_ENV);
  const currentAddresses = {
    roleManager: env.VITE_ROLE_MANAGER_ADDRESS || '',
    departmentManager: env.VITE_DEPARTMENT_MANAGER_ADDRESS || '',
    grievanceSystem: env.VITE_GRIEVANCE_SYSTEM_ADDRESS || '',
    escalationManager: env.VITE_ESCALATION_MANAGER_ADDRESS || '',
    auditTrail: env.VITE_AUDIT_TRAIL_ADDRESS || '',
  };

  const rpcUrl = process.env.SEPOLIA_RPC_URL || env.VITE_RPC_URL || 'https://gateway.tenderly.co/public/sepolia';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  console.log('1. CURRENT CONFIGURED ADDRESSES (from frontend/.env):');
  for (const [k, v] of Object.entries(currentAddresses)) {
    console.log(`   ${k.padEnd(20)}: ${v || '<NOT_CONFIGURED>'}`);
  }
  console.log('');

  // Step 1: Pre-flight bytecode & state audit
  console.log('2. PRE-DEPLOYMENT ON-CHAIN STATE AUDIT:');
  let existingBytecodeFound = false;
  for (const [name, addr] of Object.entries(currentAddresses)) {
    if (addr && ethers.isAddress(addr)) {
      try {
        const code = await provider.getCode(addr);
        const hasCode = code !== '0x' && code !== '0x0';
        if (hasCode) existingBytecodeFound = true;
        console.log(`   ${name.padEnd(20)}: ${hasCode ? `✅ ACTIVE (${(code.length - 2) / 2} bytes)` : '❌ NO BYTECODE'}`);
      } catch (err) {
        console.log(`   ${name.padEnd(20)}: ⚠️ Error querying code: ${err.message}`);
      }
    }
  }
  console.log('');

  // Step 2: Auto-snapshot existing state
  console.log('3. CREATING IMMUTABLE PRE-DEPLOYMENT STATE SNAPSHOT...');
  try {
    const { exportSepoliaState } = require('./export_sepolia_state.js');
    const { filePath } = await exportSepoliaState();
    console.log(`   Snapshot saved to: ${filePath}\n`);
  } catch (err) {
    console.warn(`   ⚠️ Warning: State export returned: ${err.message}\n`);
  }

  // Step 3: Check confirmation string
  console.log('============================================================');
  console.log('⚠️  CRITICAL DEPLOYMENT SAFETY WARNING:');
  console.log('   Deploying brand-new contracts creates EMPTY EVM STORAGE.');
  console.log('   Old records (departments, grievances, audits) will NOT');
  console.log('   be automatically visible in the new contract deployment.');
  console.log('============================================================\n');

  let confirmation = process.env.DEPLOYMENT_CONFIRMATION;
  if (!confirmation && process.stdin.isTTY) {
    confirmation = await askConfirmationPrompt(
      `To proceed, type exact confirmation string [${REQUIRED_CONFIRMATION_STRING}]: `
    );
  }

  if (confirmation !== REQUIRED_CONFIRMATION_STRING) {
    console.error('❌ DEPLOYMENT ABORTED BY SAFETY GUARD.');
    console.error(`Missing or incorrect confirmation string.`);
    console.error(`Set environment variable: DEPLOYMENT_CONFIRMATION="${REQUIRED_CONFIRMATION_STRING}"`);
    console.error('Or provide it at the interactive prompt.\n');
    process.exit(1);
  }

  // Step 4: Private Key Check (Never logged)
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  if (!privateKey) {
    console.log('------------------------------------------------------------');
    console.log('CONFIRMATION ACCEPTED, BUT NO SEPOLIA_PRIVATE_KEY FOUND.');
    console.log('For programmatic deployment:');
    console.log(`  $env:DEPLOYMENT_CONFIRMATION="${REQUIRED_CONFIRMATION_STRING}"`);
    console.log('  $env:SEPOLIA_PRIVATE_KEY="0x..."');
    console.log('  node scripts/deploy_sepolia_migration.js\n');
    console.log('OR deploy in Remix IDE (Injected Provider - MetaMask on Sepolia).');
    console.log('------------------------------------------------------------');
    return;
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const deployerAddress = await wallet.getAddress();
  const balance = await provider.getBalance(deployerAddress);

  console.log(`Deployer Address: ${deployerAddress}`);
  console.log(`Deployer Balance: ${ethers.formatEther(balance)} Sepolia ETH\n`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 Sepolia ETH. Fund the account before deployment.');
  }

  // Load contract artifacts
  const roleArtifact = loadArtifact('RoleManager');
  const deptArtifact = loadArtifact('DepartmentManager');
  const grievArtifact = loadArtifact('GrievanceSystem');
  const escArtifact = loadArtifact('EscalationManager');
  const auditArtifact = loadArtifact('AuditTrail');

  const retainedRoleManager = currentAddresses.roleManager;
  const retainedAuditTrail = currentAddresses.auditTrail;

  if (!retainedRoleManager || !ethers.isAddress(retainedRoleManager)) {
    throw new Error('Current RoleManager address is invalid or not found in frontend/.env.');
  }
  if (!retainedAuditTrail || !ethers.isAddress(retainedAuditTrail)) {
    throw new Error('Current AuditTrail address is invalid or not found in frontend/.env.');
  }

  console.log('DEPLOYMENT PLAN (RETAINING RoleManager & AuditTrail):');
  console.log(`  RoleManager:         ${retainedRoleManager} (RETAINED)`);
  console.log(`  AuditTrail:          ${retainedAuditTrail} (RETAINED)`);
  console.log('  DepartmentManager:   NEW DEPLOYMENT');
  console.log('  GrievanceSystem:     NEW DEPLOYMENT');
  console.log('  EscalationManager:   NEW DEPLOYMENT\n');

  const txHashes = [];

  // 1. Deploy DepartmentManager
  console.log('Deploying DepartmentManager...');
  const DeptFactory = new ethers.ContractFactory(deptArtifact.abi, deptArtifact.bytecode, wallet);
  const deptContract = await DeptFactory.deploy(retainedRoleManager);
  await deptContract.waitForDeployment();
  const deptAddress = await deptContract.getAddress();
  console.log(`✅ DepartmentManager deployed at: ${deptAddress}`);
  txHashes.push({ action: 'Deploy DepartmentManager', hash: deptContract.deploymentTransaction()?.hash });

  // 2. Deploy GrievanceSystem (constructor: _roleManager, _departmentManager)
  console.log('Deploying GrievanceSystem with correct departmentManager reference...');
  const GrievFactory = new ethers.ContractFactory(grievArtifact.abi, grievArtifact.bytecode, wallet);
  const grievContract = await GrievFactory.deploy(retainedRoleManager, deptAddress);
  await grievContract.waitForDeployment();
  const grievAddress = await grievContract.getAddress();
  console.log(`✅ GrievanceSystem deployed at: ${grievAddress}`);
  txHashes.push({ action: 'Deploy GrievanceSystem', hash: grievContract.deploymentTransaction()?.hash });

  // 3. Deploy EscalationManager (constructor: _roleManager, _departmentManager, _grievanceSystem)
  console.log('Deploying EscalationManager...');
  const EscFactory = new ethers.ContractFactory(escArtifact.abi, escArtifact.bytecode, wallet);
  const escContract = await EscFactory.deploy(retainedRoleManager, deptAddress, grievAddress);
  await escContract.waitForDeployment();
  const escAddress = await escContract.getAddress();
  console.log(`✅ EscalationManager deployed at: ${escAddress}`);
  txHashes.push({ action: 'Deploy EscalationManager', hash: escContract.deploymentTransaction()?.hash });

  // 4. Wiring Transactions
  console.log('\nExecuting post-deployment wiring transactions...');
  const auditContract = new ethers.Contract(retainedAuditTrail, auditArtifact.abi, wallet);

  let tx = await auditContract.setAuthorizedWriter(deptAddress, true);
  await tx.wait();
  txHashes.push({ action: 'AuditTrail.setAuthorizedWriter(DepartmentManager)', hash: tx.hash });

  tx = await auditContract.setAuthorizedWriter(grievAddress, true);
  await tx.wait();
  txHashes.push({ action: 'AuditTrail.setAuthorizedWriter(GrievanceSystem)', hash: tx.hash });

  tx = await auditContract.setAuthorizedWriter(escAddress, true);
  await tx.wait();
  txHashes.push({ action: 'AuditTrail.setAuthorizedWriter(EscalationManager)', hash: tx.hash });

  tx = await deptContract.setAuditTrail(retainedAuditTrail);
  await tx.wait();
  txHashes.push({ action: 'DepartmentManager.setAuditTrail', hash: tx.hash });

  tx = await grievContract.setAuditTrail(retainedAuditTrail);
  await tx.wait();
  txHashes.push({ action: 'GrievanceSystem.setAuditTrail', hash: tx.hash });

  tx = await grievContract.setEscalationManager(escAddress);
  await tx.wait();
  txHashes.push({ action: 'GrievanceSystem.setEscalationManager', hash: tx.hash });

  tx = await escContract.setAuditTrail(retainedAuditTrail);
  await tx.wait();
  txHashes.push({ action: 'EscalationManager.setAuditTrail', hash: tx.hash });

  console.log('All wiring transactions confirmed on Sepolia!\n');

  // Step 5: Save to deployments/sepolia history & latest manifest
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }

  const newVersion = `2.${Date.now()}`;
  const timestamp = new Date().toISOString();
  const manifestData = {
    chainId: 11155111,
    network: 'sepolia',
    deploymentVersion: newVersion,
    deploymentTimestamp: timestamp,
    contracts: {
      roleManager: retainedRoleManager,
      departmentManager: deptAddress,
      grievanceSystem: grievAddress,
      escalationManager: escAddress,
      auditTrail: retainedAuditTrail,
    },
    status: 'active',
    txHashes,
  };

  const historyFile = path.join(HISTORY_DIR, `${timestamp.replace(/[:.]/g, '-')}-v${newVersion}.json`);
  fs.writeFileSync(historyFile, JSON.stringify(manifestData, null, 2), 'utf8');
  fs.writeFileSync(path.join(DEPLOYMENTS_DIR, 'latest.json'), JSON.stringify(manifestData, null, 2), 'utf8');

  // Step 6: Update frontend/.env
  console.log('Updating frontend/.env...');
  let envContent = fs.readFileSync(FRONTEND_ENV, 'utf8');
  envContent = envContent.replace(/VITE_DEPARTMENT_MANAGER_ADDRESS=.*/, `VITE_DEPARTMENT_MANAGER_ADDRESS=${deptAddress}`);
  envContent = envContent.replace(/VITE_GRIEVANCE_SYSTEM_ADDRESS=.*/, `VITE_GRIEVANCE_SYSTEM_ADDRESS=${grievAddress}`);
  envContent = envContent.replace(/VITE_ESCALATION_MANAGER_ADDRESS=.*/, `VITE_ESCALATION_MANAGER_ADDRESS=${escAddress}`);
  fs.writeFileSync(FRONTEND_ENV, envContent);

  console.log('✅ Deployment complete, manifests archived, and frontend/.env updated successfully.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Deployment script failed:', err);
    process.exit(1);
  });
}

module.exports = { main, REQUIRED_CONFIRMATION_STRING };
