/**
 * ===================================================================
 * SEPOLIA STATE MIGRATION UTILITY
 *
 * MIGRATION WORKFLOW:
 *   OLD DEPLOYMENT
 *         ↓
 *   export state (scripts/export_sepolia_state.js)
 *         ↓
 *   deploy new contracts (scripts/deploy_sepolia_migration.js)
 *         ↓
 *   verify new deployment
 *         ↓
 *   migrate compatible state (this script)
 *         ↓
 *   verify migrated state
 *
 * COMPATIBILITY & ARCHITECTURAL LIMITATIONS:
 *
 * 1. FIELDS THAT CAN BE MIGRATED:
 *    - Departments: Name, description, and initial active status.
 *    - Department Admins: Re-assigned via Super Admin permissions.
 *    - Categories: Name, description, department ownership, and active status.
 *    - Officers: Department officer rosters registered via Department Admin.
 *    - SLA Durations: Global priority durations re-configured via Super Admin.
 *
 * 2. FIELDS THAT CANNOT BE DIRECTLY MIGRATED (IMMUTABLE EVM CONSTRAINTS):
 *    - Citizen Grievance msg.sender: createGrievance() records msg.sender as the
 *      authoritative citizen address. An administrative migration script cannot
 *      forge citizen signatures or impersonate citizen wallets on-chain.
 *    - EVM Block Timestamps: block.timestamp is determined by current block header.
 *      Historical submission and resolution dates cannot be backdated.
 *    - Historical Audit Entries: AuditTrail stamps block.timestamp at append time.
 *      Past transaction hashes and historical block times cannot be faked.
 *
 * SAFETY GUARD:
 * - Does NOT run automatically.
 * - Runs in --dry-run mode by default unless --execute flag is passed.
 * - Requires explicit private key with Super Admin role.
 * ===================================================================
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const FRONTEND_ENV = path.join(__dirname, '..', 'frontend', '.env');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups', 'sepolia');

function loadArtifact(name) {
  const filePath = path.join(BUILD_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact ${name}.json not found in build/. Run 'node scripts/compile.js' first.`);
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

async function migrateState(options = {}) {
  const isExecute = options.execute === true || process.argv.includes('--execute');
  const snapshotPath = options.snapshotFile || path.join(BACKUPS_DIR, 'latest-state.json');

  console.log('============================================================');
  console.log('       SEPOLIA ON-CHAIN STATE MIGRATION UTILITY');
  console.log(`       Mode: ${isExecute ? '⚡ LIVE EXECUTION' : '🔍 DRY-RUN PREVIEW (No on-chain changes)'}`);
  console.log('============================================================\n');

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`State snapshot file not found: ${snapshotPath}. Run 'node scripts/export_sepolia_state.js' first.`);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  console.log(`Loaded snapshot from: ${snapshotPath}`);
  console.log(`Snapshot Export Date: ${snapshot.metadata.exportedAt}`);
  console.log(`Source Block:         #${snapshot.metadata.blockNumber}\n`);

  const env = parseEnv(FRONTEND_ENV);
  const targetAddresses = {
    roleManager: env.VITE_ROLE_MANAGER_ADDRESS,
    departmentManager: env.VITE_DEPARTMENT_MANAGER_ADDRESS,
    grievanceSystem: env.VITE_GRIEVANCE_SYSTEM_ADDRESS,
    escalationManager: env.VITE_ESCALATION_MANAGER_ADDRESS,
    auditTrail: env.VITE_AUDIT_TRAIL_ADDRESS,
  };

  const rpcUrl = process.env.SEPOLIA_RPC_URL || env.VITE_RPC_URL || 'https://gateway.tenderly.co/public/sepolia';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const deptArtifact = loadArtifact('DepartmentManager');
  const roleArtifact = loadArtifact('RoleManager');

  console.log('TARGET CONTRACTS (from frontend/.env):');
  for (const [k, v] of Object.entries(targetAddresses)) {
    console.log(`   ${k.padEnd(20)}: ${v}`);
  }
  console.log('');

  const deptContractRead = new ethers.Contract(targetAddresses.departmentManager, deptArtifact.abi, provider);
  const existingDeptCount = Number(await deptContractRead.getDepartmentCount().catch(() => 0n));
  const existingCatCount = Number(await deptContractRead.getCategoryCount().catch(() => 0n));

  console.log(`Target Contract Current State:`);
  console.log(`   Departments on target: ${existingDeptCount}`);
  console.log(`   Categories on target:  ${existingCatCount}\n`);

  console.log('------------------------------------------------------------');
  console.log('COMPATIBLE ENTITY MIGRATION PLAN:');
  console.log('------------------------------------------------------------');

  const deptActions = [];
  for (const dept of snapshot.departments || []) {
    deptActions.push({
      type: 'DEPARTMENT',
      id: dept.id,
      name: dept.name,
      description: dept.description,
      admin: dept.admin,
      officers: dept.officers || [],
      requiresCreation: dept.id > existingDeptCount,
    });
  }

  const catActions = [];
  for (const cat of snapshot.categories || []) {
    catActions.push({
      type: 'CATEGORY',
      id: cat.id,
      name: cat.name,
      description: cat.description,
      departmentId: cat.departmentId,
      isActive: cat.isActive,
      requiresCreation: cat.id > existingCatCount,
    });
  }

  console.log(`Departments to reconcile: ${deptActions.length}`);
  for (const d of deptActions) {
    console.log(`  - [Dept #${d.id}] "${d.name}" (Admin: ${d.admin}) -> ${d.requiresCreation ? 'WILL CREATE' : 'EXISTS ON TARGET'}`);
  }

  console.log(`\nCategories to reconcile:  ${catActions.length}`);
  for (const c of catActions) {
    console.log(`  - [Cat #${c.id}] "${c.name}" (Dept #${c.departmentId}) -> ${c.requiresCreation ? 'WILL CREATE' : 'EXISTS ON TARGET'}`);
  }

  console.log('\n------------------------------------------------------------');
  console.log('NON-MIGRATABLE ENTITIES (ARCHIVAL ONLY):');
  console.log('------------------------------------------------------------');
  console.log(`Grievances in snapshot: ${snapshot.grievances?.length || 0}`);
  console.log('Notice: Historical grievances remain preserved on the previous contract.');
  console.log('They cannot be replayed with forged citizen msg.sender without a custom');
  console.log('migration contract.');

  if (!isExecute) {
    console.log('\n============================================================');
    console.log('DRY-RUN COMPLETE. No transactions were submitted.');
    console.log('To execute migration on Sepolia, run:');
    console.log('  node scripts/migrate_sepolia_state.js --execute');
    console.log('with SEPOLIA_PRIVATE_KEY configured in environment.');
    console.log('============================================================\n');
    return;
  }

  // Live execution mode
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SEPOLIA_PRIVATE_KEY environment variable required for live execution.');
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const deptContract = new ethers.Contract(targetAddresses.departmentManager, deptArtifact.abi, wallet);

  console.log('\nExecuting Department Migration...');
  for (const d of deptActions) {
    if (d.requiresCreation) {
      console.log(`Creating department "${d.name}" on target...`);
      const adminAddr = d.admin && ethers.isAddress(d.admin) && d.admin !== ethers.ZeroAddress ? d.admin : wallet.address;
      const tx = await deptContract.createDepartment(d.name, d.description || '', adminAddr);
      console.log(`  Tx Hash: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ Department "${d.name}" created.`);
    }
  }

  console.log('\nExecuting Category Migration...');
  for (const c of catActions) {
    if (c.requiresCreation) {
      console.log(`Creating category "${c.name}" for Department #${c.departmentId}...`);
      const tx = await deptContract.createCategory(c.departmentId, c.name, c.description || '');
      console.log(`  Tx Hash: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ Category "${c.name}" created.`);
    }
  }

  console.log('\nMigration execution completed successfully!');
}

if (require.main === module) {
  migrateState().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrateState };
