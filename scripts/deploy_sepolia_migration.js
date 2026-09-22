/**
 * ===================================================================
 * ETHEREUM SEPOLIA CONTRACT MIGRATION & DEPLOYMENT SCRIPT
 * Target Network: Ethereum Sepolia (Chain ID: 11155111)
 *
 * MIGRATION SUMMARY:
 * Retained:
 *   - RoleManager: 0xD3f4d5659dd2cA9634FC107b88B59F3A8b6628f8
 *   - AuditTrail:  0xa948Ab51618C8Dc253Df3d92DB330965E38dDA88
 * Redeploying:
 *   - DepartmentManager (adds department-scoped category creation)
 *   - GrievanceSystem (immutable departmentManager reference)
 *   - EscalationManager (immutable departmentManager & grievanceSystem references)
 * ===================================================================
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RETAINED_ROLE_MANAGER = '0xD3f4d5659dd2cA9634FC107b88B59F3A8b6628f8';
const RETAINED_AUDIT_TRAIL  = '0xa948Ab51618C8Dc253Df3d92DB330965E38dDA88';

const BUILD_DIR = path.join(__dirname, '..', 'build');
const FRONTEND_ENV = path.join(__dirname, '..', 'frontend', '.env');

function loadArtifact(name) {
  const filePath = path.join(BUILD_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact ${name}.json not found in build/ directory. Run 'node scripts/compile.js' first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  console.log('============================================================');
  console.log('   SEPOLIA CONTRACT MIGRATION - SPECIFICATION & RUNNER');
  console.log('============================================================\n');

  console.log('RETAINED CONTRACTS (Sources unchanged):');
  console.log(`  RoleManager:  ${RETAINED_ROLE_MANAGER}`);
  console.log(`  AuditTrail:   ${RETAINED_AUDIT_TRAIL}\n`);

  console.log('DEPLOYMENT ORDER & CONSTRUCTOR ARGUMENTS:');
  console.log('  1. DepartmentManager');
  console.log(`     - Constructor arg 1 (roleManager): ${RETAINED_ROLE_MANAGER}`);
  console.log('  2. GrievanceSystem');
  console.log(`     - Constructor arg 1 (roleManager):         ${RETAINED_ROLE_MANAGER}`);
  console.log('     - Constructor arg 2 (departmentManager):   <NEW_DEPARTMENT_MANAGER_ADDRESS>');
  console.log('  3. EscalationManager');
  console.log(`     - Constructor arg 1 (roleManager):         ${RETAINED_ROLE_MANAGER}`);
  console.log('     - Constructor arg 2 (departmentManager):   <NEW_DEPARTMENT_MANAGER_ADDRESS>');
  console.log('     - Constructor arg 3 (grievanceSystem):     <NEW_GRIEVANCE_SYSTEM_ADDRESS>\n');

  console.log('POST-DEPLOYMENT WIRING REQUIRED (Signed by Super Admin):');
  console.log('  AuditTrail (0xa948Ab51618C8Dc253Df3d92DB330965E38dDA88):');
  console.log('    - setAuthorizedWriter(<NEW_DEPARTMENT_MANAGER_ADDRESS>, true)');
  console.log('    - setAuthorizedWriter(<NEW_GRIEVANCE_SYSTEM_ADDRESS>, true)');
  console.log('    - setAuthorizedWriter(<NEW_ESCALATION_MANAGER_ADDRESS>, true)');
  console.log('  DepartmentManager:');
  console.log(`    - setAuditTrail(${RETAINED_AUDIT_TRAIL})`);
  console.log('  GrievanceSystem:');
  console.log(`    - setAuditTrail(${RETAINED_AUDIT_TRAIL})`);
  console.log('    - setEscalationManager(<NEW_ESCALATION_MANAGER_ADDRESS>)');
  console.log('  EscalationManager:');
  console.log(`    - setAuditTrail(${RETAINED_AUDIT_TRAIL})\n`);

  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

  if (!privateKey) {
    console.log('------------------------------------------------------------');
    console.log('NO SEPOLIA_PRIVATE_KEY PROVIDED IN ENVIRONMENT.');
    console.log('To deploy programmatically:');
    console.log('  $env:SEPOLIA_PRIVATE_KEY="0x..."');
    console.log('  node scripts/deploy_sepolia_migration.js\n');
    console.log('OR deploy in Remix IDE (Injected Provider - MetaMask on Sepolia)');
    console.log('using the exact constructor arguments listed above.');
    console.log('------------------------------------------------------------');
    return;
  }

  console.log(`Connecting to Sepolia via ${rpcUrl}...`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const deployerAddress = await wallet.getAddress();
  const balance = await provider.getBalance(deployerAddress);

  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} Sepolia ETH\n`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 Sepolia ETH. Fund the account with testnet ETH.');
  }

  const deptArtifact = loadArtifact('DepartmentManager');
  const grievArtifact = loadArtifact('GrievanceSystem');
  const escArtifact = loadArtifact('EscalationManager');
  const auditArtifact = loadArtifact('AuditTrail');

  const txHashes = [];

  // 1. Deploy DepartmentManager
  console.log('Deploying DepartmentManager...');
  const DeptFactory = new ethers.ContractFactory(deptArtifact.abi, deptArtifact.bytecode, wallet);
  const deptContract = await DeptFactory.deploy(RETAINED_ROLE_MANAGER);
  const deptDeployTx = deptContract.deploymentTransaction();
  if (deptDeployTx) {
    console.log(`  Tx Hash: ${deptDeployTx.hash}`);
    txHashes.push({ action: 'Deploy DepartmentManager', hash: deptDeployTx.hash });
  }
  await deptContract.waitForDeployment();
  const deptAddress = await deptContract.getAddress();
  console.log(`✅ DepartmentManager deployed at: ${deptAddress}`);

  // 2. Deploy GrievanceSystem
  console.log('Deploying GrievanceSystem...');
  const GrievFactory = new ethers.ContractFactory(grievArtifact.abi, grievArtifact.bytecode, wallet);
  const grievContract = await GrievFactory.deploy(RETAINED_ROLE_MANAGER, deptAddress);
  const grievDeployTx = grievContract.deploymentTransaction();
  if (grievDeployTx) {
    console.log(`  Tx Hash: ${grievDeployTx.hash}`);
    txHashes.push({ action: 'Deploy GrievanceSystem', hash: grievDeployTx.hash });
  }
  await grievContract.waitForDeployment();
  const grievAddress = await grievContract.getAddress();
  console.log(`✅ GrievanceSystem deployed at: ${grievAddress}`);

  // 3. Deploy EscalationManager
  console.log('Deploying EscalationManager...');
  const EscFactory = new ethers.ContractFactory(escArtifact.abi, escArtifact.bytecode, wallet);
  const escContract = await EscFactory.deploy(RETAINED_ROLE_MANAGER, deptAddress, grievAddress);
  const escDeployTx = escContract.deploymentTransaction();
  if (escDeployTx) {
    console.log(`  Tx Hash: ${escDeployTx.hash}`);
    txHashes.push({ action: 'Deploy EscalationManager', hash: escDeployTx.hash });
  }
  await escContract.waitForDeployment();
  const escAddress = await escContract.getAddress();
  console.log(`✅ EscalationManager deployed at: ${escAddress}`);

  // 4. Perform Wiring
  console.log('\nExecuting wiring transactions...');
  const auditContract = new ethers.Contract(RETAINED_AUDIT_TRAIL, auditArtifact.abi, wallet);

  console.log('- Authorizing DepartmentManager in AuditTrail...');
  let tx = await auditContract.setAuthorizedWriter(deptAddress, true);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'AuditTrail.setAuthorizedWriter(DepartmentManager)', hash: tx.hash });
  await tx.wait();

  console.log('- Authorizing GrievanceSystem in AuditTrail...');
  tx = await auditContract.setAuthorizedWriter(grievAddress, true);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'AuditTrail.setAuthorizedWriter(GrievanceSystem)', hash: tx.hash });
  await tx.wait();

  console.log('- Authorizing EscalationManager in AuditTrail...');
  tx = await auditContract.setAuthorizedWriter(escAddress, true);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'AuditTrail.setAuthorizedWriter(EscalationManager)', hash: tx.hash });
  await tx.wait();

  console.log('- Setting AuditTrail on DepartmentManager...');
  tx = await deptContract.setAuditTrail(RETAINED_AUDIT_TRAIL);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'DepartmentManager.setAuditTrail', hash: tx.hash });
  await tx.wait();

  console.log('- Setting AuditTrail on GrievanceSystem...');
  tx = await grievContract.setAuditTrail(RETAINED_AUDIT_TRAIL);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'GrievanceSystem.setAuditTrail', hash: tx.hash });
  await tx.wait();

  console.log('- Setting EscalationManager on GrievanceSystem...');
  tx = await grievContract.setEscalationManager(escAddress);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'GrievanceSystem.setEscalationManager', hash: tx.hash });
  await tx.wait();

  console.log('- Setting AuditTrail on EscalationManager...');
  tx = await escContract.setAuditTrail(RETAINED_AUDIT_TRAIL);
  console.log(`  Tx Hash: ${tx.hash}`);
  txHashes.push({ action: 'EscalationManager.setAuditTrail', hash: tx.hash });
  await tx.wait();

  console.log('\nAll wiring transactions confirmed on Sepolia!');

  // 5. Verification checks
  console.log('\nVerifying on-chain dependencies and bytecode...');
  const deptCode = await provider.getCode(deptAddress);
  const selCat = ethers.id('createCategory(uint256,string,string)').slice(2, 10);
  const hasSelector = deptCode.includes(selCat);
  console.log(`- DepartmentManager bytecode length: ${deptCode.length} bytes`);
  console.log(`- Contains createCategory(uint256,string,string) [${selCat}]: ${hasSelector ? '✅ YES' : '❌ NO'}`);

  const roleInDept = await deptContract.roleManager();
  console.log(`- DepartmentManager.roleManager(): ${roleInDept} (Matches: ${roleInDept === RETAINED_ROLE_MANAGER})`);

  const deptInGriev = await grievContract.departmentManager();
  console.log(`- GrievanceSystem.departmentManager(): ${deptInGriev} (Matches: ${deptInGriev === deptAddress})`);

  const grievInEsc = await escContract.grievanceSystem();
  console.log(`- EscalationManager.grievanceSystem(): ${grievInEsc} (Matches: ${grievInEsc === grievAddress})`);

  // 6. Update frontend/.env
  console.log('\nUpdating frontend/.env...');
  let envContent = fs.readFileSync(FRONTEND_ENV, 'utf8');
  envContent = envContent.replace(/VITE_DEPARTMENT_MANAGER_ADDRESS=.*/, `VITE_DEPARTMENT_MANAGER_ADDRESS=${deptAddress}`);
  envContent = envContent.replace(/VITE_GRIEVANCE_SYSTEM_ADDRESS=.*/, `VITE_GRIEVANCE_SYSTEM_ADDRESS=${grievAddress}`);
  envContent = envContent.replace(/VITE_ESCALATION_MANAGER_ADDRESS=.*/, `VITE_ESCALATION_MANAGER_ADDRESS=${escAddress}`);
  fs.writeFileSync(FRONTEND_ENV, envContent);
  console.log('✅ frontend/.env updated successfully.');

  console.log('\n============================================================');
  console.log('FINAL DEPLOYED ADDRESSES (Ethereum Sepolia):');
  console.log(`  RoleManager:         ${RETAINED_ROLE_MANAGER}`);
  console.log(`  DepartmentManager:   ${deptAddress}`);
  console.log(`  GrievanceSystem:     ${grievAddress}`);
  console.log(`  EscalationManager:   ${escAddress}`);
  console.log(`  AuditTrail:          ${RETAINED_AUDIT_TRAIL}`);
  console.log('============================================================\n');

  console.log('TRANSACTION HASHES (Sepolia Explorer):');
  for (const item of txHashes) {
    console.log(`  ${item.action}:`);
    console.log(`    https://sepolia.etherscan.io/tx/${item.hash}`);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
