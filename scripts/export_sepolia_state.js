/**
 * ===================================================================
 * SEPOLIA CONTRACT STATE EXPORT SCRIPT (READ-ONLY)
 *
 * Exports current on-chain state of all deployed Sepolia contracts
 * into backups/sepolia/<timestamp>-state.json.
 *
 * STRICT SAFETY RULES:
 * - Pure READ-ONLY operations. No transactions, no gas spent, no state mutation.
 * - Does not require private keys.
 * ===================================================================
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const FRONTEND_ENV = path.join(__dirname, '..', 'frontend', '.env');
const BUILD_DIR = path.join(__dirname, '..', 'build');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups', 'sepolia');

function loadArtifact(name) {
  const filePath = path.join(BUILD_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact ${name}.json not found in build/. Run 'node scripts/compile.js' first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        env[k] = v;
      }
    }
  }
  return env;
}

async function exportSepoliaState() {
  console.log('============================================================');
  console.log('       SEPOLIA ON-CHAIN STATE EXPORT (READ-ONLY)');
  console.log('============================================================\n');

  const env = parseEnv(FRONTEND_ENV);
  const addresses = {
    roleManager: env.VITE_ROLE_MANAGER_ADDRESS,
    departmentManager: env.VITE_DEPARTMENT_MANAGER_ADDRESS,
    grievanceSystem: env.VITE_GRIEVANCE_SYSTEM_ADDRESS,
    escalationManager: env.VITE_ESCALATION_MANAGER_ADDRESS,
    auditTrail: env.VITE_AUDIT_TRAIL_ADDRESS,
  };

  const rpcList = [
    'https://gateway.tenderly.co/public/sepolia',
    env.VITE_RPC_URL,
    'https://ethereum-sepolia-rpc.publicnode.com',
  ].filter(Boolean);

  let provider = null;
  for (const rpc of rpcList) {
    try {
      const p = new ethers.JsonRpcProvider(rpc);
      await p.getBlockNumber();
      provider = p;
      console.log(`Connected to RPC: ${rpc}`);
      break;
    } catch {
      // try next
    }
  }

  if (!provider) {
    throw new Error('Could not connect to any Sepolia RPC provider.');
  }

  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const blockTimestamp = block ? block.timestamp : Math.floor(Date.now() / 1000);

  console.log(`Current Sepolia Block: #${blockNumber} (${new Date(blockTimestamp * 1000).toISOString()})`);
  console.log('Reading contract bytecodes and state...\n');

  const roleArtifact = loadArtifact('RoleManager');
  const deptArtifact = loadArtifact('DepartmentManager');
  const grievArtifact = loadArtifact('GrievanceSystem');
  const escArtifact = loadArtifact('EscalationManager');
  const auditArtifact = loadArtifact('AuditTrail');

  const roleContract = new ethers.Contract(addresses.roleManager, roleArtifact.abi, provider);
  const deptContract = new ethers.Contract(addresses.departmentManager, deptArtifact.abi, provider);
  const grievContract = new ethers.Contract(addresses.grievanceSystem, grievArtifact.abi, provider);
  const escContract = new ethers.Contract(addresses.escalationManager, escArtifact.abi, provider);
  const auditContract = new ethers.Contract(addresses.auditTrail, auditArtifact.abi, provider);

  const snapshot = {
    metadata: {
      chainId: 11155111,
      network: 'sepolia',
      exportedAt: new Date().toISOString(),
      blockNumber,
      blockTimestamp,
    },
    contracts: { ...addresses },
    bytecodes: {},
    wiring: {},
    departments: [],
    categories: [],
    officers: [],
    grievances: [],
    auditEntries: [],
  };

  // 1. Verify bytecodes
  for (const [key, addr] of Object.entries(addresses)) {
    if (addr && ethers.isAddress(addr)) {
      const code = await provider.getCode(addr);
      snapshot.bytecodes[key] = {
        address: addr,
        hasCode: code !== '0x' && code !== '0x0',
        lengthBytes: (code.length - 2) / 2,
      };
    }
  }

  // 2. Read Wiring
  try {
    snapshot.wiring.deptRoleManager = await deptContract.roleManager().catch(() => null);
    snapshot.wiring.deptAuditTrail = await deptContract.auditTrail().catch(() => null);
    snapshot.wiring.grievRoleManager = await grievContract.roleManager().catch(() => null);
    snapshot.wiring.grievDeptManager = await grievContract.departmentManager().catch(() => null);
    snapshot.wiring.grievAuditTrail = await grievContract.auditTrail().catch(() => null);
    snapshot.wiring.grievEscManager = await grievContract.escalationManager().catch(() => null);
    snapshot.wiring.escRoleManager = await escContract.roleManager().catch(() => null);
    snapshot.wiring.escDeptManager = await escContract.departmentManager().catch(() => null);
    snapshot.wiring.escGrievSystem = await escContract.grievanceSystem().catch(() => null);
    snapshot.wiring.escAuditTrail = await escContract.auditTrail().catch(() => null);
    snapshot.wiring.auditRoleManager = await auditContract.roleManager().catch(() => null);
  } catch (err) {
    console.warn('Warning reading wiring:', err.message);
  }

  // 3. Read Departments
  let deptCount = 0;
  try {
    const rawCount = await deptContract.getDepartmentCount();
    deptCount = Number(rawCount);
    console.log(`Total on-chain departments: ${deptCount}`);
    for (let id = 1; id <= deptCount; id++) {
      try {
        const raw = await deptContract.getDepartment(id);
        const admin = await deptContract.getDepartmentAdmin(id).catch(() => ethers.ZeroAddress);
        const isActive = await deptContract.isDepartmentActive(id).catch(() => false);
        const officers = await deptContract.getDepartmentOfficers(id).catch(() => []);

        snapshot.departments.push({
          id,
          name: raw.name || raw[0],
          description: raw.description || raw[1] || '',
          admin,
          isActive,
          officers: Array.from(officers),
        });
      } catch (deptErr) {
        console.warn(`  Failed reading department #${id}:`, deptErr.message);
      }
    }
  } catch (err) {
    console.warn('Could not read department count:', err.message);
  }

  // 4. Read Categories
  let catCount = 0;
  try {
    const rawCount = await deptContract.getCategoryCount();
    catCount = Number(rawCount);
    console.log(`Total on-chain categories: ${catCount}`);
    for (let id = 1; id <= catCount; id++) {
      try {
        const raw = await deptContract.getCategory(id);
        const deptId = await deptContract.getCategoryDepartment(id).catch(() => 0n);
        const isActive = await deptContract.isCategoryActive(id).catch(() => false);

        snapshot.categories.push({
          id,
          name: raw.name || raw[0],
          description: raw.description || raw[1] || '',
          departmentId: Number(deptId || raw.departmentId || raw[2]),
          isActive,
          exists: raw.exists !== undefined ? raw.exists : true,
        });
      } catch (catErr) {
        console.warn(`  Failed reading category #${id}:`, catErr.message);
      }
    }
  } catch (err) {
    console.warn('Could not read category count:', err.message);
  }

  // 5. Read Grievances
  let grievCount = 0;
  try {
    const rawCount = await grievContract.getGrievanceCount();
    grievCount = Number(rawCount);
    console.log(`Total on-chain grievances: ${grievCount}`);
    for (let id = 1; id <= grievCount; id++) {
      try {
        const g = await grievContract.getGrievance(id);
        const res = await grievContract.getResolution(id).catch(() => null);

        snapshot.grievances.push({
          id,
          citizen: g.citizen || g[1],
          departmentId: Number(g.departmentId || g[2]),
          categoryId: Number(g.categoryId || g[3]),
          priority: Number(g.priority || g[4]),
          status: Number(g.status || g[5]),
          assignedOfficer: g.assignedOfficer || g[6],
          title: g.title || g[7],
          createdAt: Number(g.createdAt || g[8]),
          updatedAt: Number(g.updatedAt || g[9]),
          resolution: res ? {
            details: res.details || res[0],
            evidenceCid: res.evidenceCid || res[1],
            resolvedBy: res.resolvedBy || res[2],
            resolvedAt: Number(res.resolvedAt || res[3]),
          } : null,
        });
      } catch (gErr) {
        console.warn(`  Failed reading grievance #${id}:`, gErr.message);
      }
    }
  } catch (err) {
    console.warn('Could not read grievance count:', err.message);
  }

  // 6. Read Audit Entries
  try {
    const auditCount = Number(await auditContract.getAuditCount().catch(() => 0n));
    console.log(`Total on-chain audit entries: ${auditCount}`);
    if (auditCount > 0) {
      const endBatch = Math.min(auditCount, 100);
      const entries = await auditContract.getAuditEntries(1, endBatch).catch(() => []);
      for (const e of entries) {
        snapshot.auditEntries.push({
          id: Number(e.id || e[0]),
          action: Number(e.action || e[1]),
          actor: e.actor || e[2],
          targetId: Number(e.targetId || e[3]),
          detailsHash: e.detailsHash || e[4],
          timestamp: Number(e.timestamp || e[5]),
        });
      }
    }
  } catch (err) {
    console.warn('Could not read audit entries:', err.message);
  }

  // Save to backups/sepolia
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestampStr}-state.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  const latestPath = path.join(BACKUPS_DIR, 'latest-state.json');

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(`✅ State snapshot exported successfully!`);
  console.log(`File: ${filePath}`);
  console.log(`Latest symlink/copy: ${latestPath}`);
  console.log(`Summary:`);
  console.log(`  Departments: ${snapshot.departments.length}`);
  console.log(`  Categories:  ${snapshot.categories.length}`);
  console.log(`  Grievances:  ${snapshot.grievances.length}`);
  console.log(`  Audits:      ${snapshot.auditEntries.length}`);
  console.log('============================================================\n');

  return { filePath, snapshot };
}

if (require.main === module) {
  exportSepoliaState().catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  });
}

module.exports = { exportSepoliaState };
