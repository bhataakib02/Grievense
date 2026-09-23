/**
 * ===================================================================
 * CITIZEN GRIEVANCE SUBMISSION REVERT DIAGNOSTIC SCRIPT
 * Network: Ethereum Sepolia (Chain ID: 11155111)
 *
 * Simulates the exact citizen grievance submission call via staticCall
 * and traces internal contract dependencies:
 * - GrievanceSystem -> DepartmentManager
 * - GrievanceSystem -> RoleManager
 * - GrievanceSystem -> AuditTrail
 * - GrievanceSystem -> EscalationManager
 * ===================================================================
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const FRONTEND_ENV = path.join(__dirname, '..', 'frontend', '.env');

function loadArtifact(name) {
  const filePath = path.join(BUILD_DIR, `${name}.json`);
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
        env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
      }
    }
  }
  return env;
}

async function main() {
  console.log('============================================================');
  console.log('   DIAGNOSING SEPOLIA CITIZEN SUBMISSION REVERT');
  console.log('============================================================\n');

  const env = parseEnv(FRONTEND_ENV);
  const addresses = {
    RoleManager: env.VITE_ROLE_MANAGER_ADDRESS,
    DepartmentManager: env.VITE_DEPARTMENT_MANAGER_ADDRESS,
    GrievanceSystem: env.VITE_GRIEVANCE_SYSTEM_ADDRESS,
    EscalationManager: env.VITE_ESCALATION_MANAGER_ADDRESS,
    AuditTrail: env.VITE_AUDIT_TRAIL_ADDRESS,
  };

  const rpcUrl = 'https://gateway.tenderly.co/public/sepolia';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const blockNumber = await provider.getBlockNumber();
  console.log(`Connected to Sepolia Block: #${blockNumber}\n`);

  console.log('1. CONFIGURED ADDRESSES & BYTECODE VERIFICATION:');
  const bytecodes = {};
  for (const [name, addr] of Object.entries(addresses)) {
    const code = await provider.getCode(addr);
    const hasCode = code !== '0x' && code !== '0x0';
    bytecodes[name] = hasCode;
    console.log(`   ${name.padEnd(20)}: ${addr} -> ${hasCode ? `✅ ACTIVE (${(code.length - 2) / 2} bytes)` : '❌ 0x EMPTY'}`);
  }
  console.log('');

  // Load contract interfaces
  const roleArtifact = loadArtifact('RoleManager');
  const deptArtifact = loadArtifact('DepartmentManager');
  const grievArtifact = loadArtifact('GrievanceSystem');
  const escArtifact = loadArtifact('EscalationManager');
  const auditArtifact = loadArtifact('AuditTrail');

  const roleContract = new ethers.Contract(addresses.RoleManager, roleArtifact.abi, provider);
  const deptContract = new ethers.Contract(addresses.DepartmentManager, deptArtifact.abi, provider);
  const grievContract = new ethers.Contract(addresses.GrievanceSystem, grievArtifact.abi, provider);
  const escContract = new ethers.Contract(addresses.EscalationManager, escArtifact.abi, provider);
  const auditContract = new ethers.Contract(addresses.AuditTrail, auditArtifact.abi, provider);

  // 2. Cross-contract reference inspection
  console.log('2. CROSS-CONTRACT WIRING / GETTERS IN GRIEVANCESYSTEM:');
  const grievRole = await grievContract.roleManager().catch((e) => `REVERT: ${e.message}`);
  const grievDept = await grievContract.departmentManager().catch((e) => `REVERT: ${e.message}`);
  const grievAudit = await grievContract.auditTrail().catch((e) => `REVERT: ${e.message}`);
  const grievEsc = await grievContract.escalationManager().catch((e) => `REVERT: ${e.message}`);

  console.log(`   GrievanceSystem.roleManager()        : ${grievRole}`);
  console.log(`     Matches configured RoleManager?    : ${grievRole.toLowerCase() === addresses.RoleManager.toLowerCase()}`);
  console.log(`   GrievanceSystem.departmentManager()  : ${grievDept}`);
  console.log(`     Matches configured DeptManager?    : ${grievDept.toLowerCase() === addresses.DepartmentManager.toLowerCase()}`);
  console.log(`     WARNING: Points to RoleManager?    : ${grievDept.toLowerCase() === addresses.RoleManager.toLowerCase() ? '🚨 YES! (FATAL MISWIRING)' : 'No'}`);
  console.log(`   GrievanceSystem.auditTrail()         : ${grievAudit}`);
  console.log(`     Matches configured AuditTrail?     : ${grievAudit.toLowerCase() === addresses.AuditTrail.toLowerCase()}`);
  console.log(`   GrievanceSystem.escalationManager()  : ${grievEsc}`);
  console.log(`     Matches configured EscalationMgr?  : ${grievEsc.toLowerCase() === addresses.EscalationManager.toLowerCase()}`);
  console.log('');

  console.log('3. AUDITTRAIL AUTHORIZED WRITERS:');
  const grievIsWriter = await auditContract.isAuthorizedWriter(addresses.GrievanceSystem).catch(() => false);
  const deptIsWriter = await auditContract.isAuthorizedWriter(addresses.DepartmentManager).catch(() => false);
  const escIsWriter = await auditContract.isAuthorizedWriter(addresses.EscalationManager).catch(() => false);
  console.log(`   AuditTrail.isAuthorizedWriter(GrievanceSystem)   : ${grievIsWriter}`);
  console.log(`   AuditTrail.isAuthorizedWriter(DepartmentManager) : ${deptIsWriter}`);
  console.log(`   AuditTrail.isAuthorizedWriter(EscalationManager) : ${escIsWriter}\n`);

  console.log('4. DEPARTMENT #1 AND CATEGORY #1 STATE:');
  const dept1 = await deptContract.getDepartment(1).catch((e) => `ERR: ${e.message}`);
  const dept1Active = await deptContract.isDepartmentActive(1).catch((e) => `ERR: ${e.message}`);
  const dept1Admin = await deptContract.getDepartmentAdmin(1).catch((e) => `ERR: ${e.message}`);
  const cat1 = await deptContract.getCategory(1).catch((e) => `ERR: ${e.message}`);
  const cat1Active = await deptContract.isCategoryActive(1).catch((e) => `ERR: ${e.message}`);
  const cat1Dept = await deptContract.getCategoryDepartment(1).catch((e) => `ERR: ${e.message}`);
  const cat1Exists = await deptContract.categoryExists(1).catch((e) => `ERR: ${e.message}`);

  console.log(`   Department 1: name="${dept1.name || dept1[0]}", admin=${dept1Admin}, isActive=${dept1Active}`);
  console.log(`   Category 1  : name="${cat1.name || cat1[0]}", deptId=${cat1Dept}, isActive=${cat1Active}, exists=${cat1Exists}\n`);

  // 5. Account 4 Citizen Role Check
  const account4 = ethers.getAddress('0x3CA72834b6F60E21e25e903c70f681aF1b77AE62'.toLowerCase());
  console.log(`5. CITIZEN PERMISSIONS FOR ACCOUNT 4 (${account4}):`);
  const CITIZEN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('CITIZEN_ROLE'));
  const isCitizen = await roleContract.hasRole(CITIZEN_ROLE, account4).catch((e) => `ERR: ${e.message}`);
  console.log(`   RoleManager.hasRole(CITIZEN_ROLE, Account4): ${isCitizen}\n`);

  // 6. Simulate createGrievance via staticCall
  console.log('6. EXACT STATIC CALL SIMULATION:');
  const departmentId = 1n;
  const categoryId = 1n;
  const priority = 1; // High Priority
  const title = 'Water contamination issue in North Ward';
  const descriptionCid = 'bafkreicr6m3a75pkyfms7j3f4p2o6y7m7w5s7d3p2o6y7m7w5s7d3p2o6y';
  const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes('Water contamination issue detailed payload'));

  console.log('   Function: createGrievance(uint256,uint256,uint8,string,string,bytes32)');
  console.log('   Parameters:');
  console.log(`     categoryId      : ${categoryId}`);
  console.log(`     departmentId    : ${departmentId}`);
  console.log(`     priority        : ${priority}`);
  console.log(`     title           : "${title}"`);
  console.log(`     descriptionCid  : "${descriptionCid}"`);
  console.log(`     descriptionHash : ${descriptionHash}`);
  console.log(`     caller (from)   : ${account4}`);

  try {
    const res = await grievContract.createGrievance.staticCall(
      categoryId,
      departmentId,
      priority,
      title,
      descriptionCid,
      descriptionHash,
      { from: account4 }
    );
    console.log(`\n✅ staticCall SUCCEEDED! Returned:`, res);
  } catch (err) {
    console.log(`\n❌ staticCall REVERTED!`);
    console.log(`   Message:    ${err.message}`);
    console.log(`   Revert data: ${err.data || '<empty (0x)>'}`);
    if (err.data && err.data !== '0x') {
      try {
        const decoded = grievContract.interface.parseError(err.data);
        console.log(`   Decoded Custom Error: ${decoded.name}(${decoded.args})`);
      } catch (parseErr) {
        console.log(`   Could not parse error selector: ${err.data.slice(0, 10)}`);
      }
    } else {
      console.log(`   ROOT CAUSE ANALYSIS OF EMPTY REVERT:`);
      console.log(`   The revert return data is 0 bytes (0x).`);
      console.log(`   In Solidity, when contract A makes an external call (e.g. STATICCALL)`);
      console.log(`   to contract B, and contract B reverts with empty data (or has no such`);
      console.log(`   function selector and no fallback function), the empty revert is`);
      console.log(`   propagated up to the top-level call.`);
      console.log(`   Here: GrievanceSystem at ${addresses.GrievanceSystem} has immutable`);
      console.log(`   departmentManager = ${grievDept} (which is RoleManager!).`);
      console.log(`   At line 1436: departmentManager.categoryExists(categoryId)`);
      console.log(`   calls RoleManager.categoryExists(1).`);
      console.log(`   RoleManager does NOT have categoryExists() and has no fallback(),`);
      console.log(`   so RoleManager reverts with 0x, causing GrievanceSystem to revert with 0x!`);
    }
  }

  // 7. Test what happens if we directly query categoryExists on RoleManager vs DepartmentManager
  console.log('\n7. DIRECT PROOF OF INTERFACE MISMATCH:');
  const fakeDeptContract = new ethers.Contract(grievDept, deptArtifact.abi, provider);
  try {
    await fakeDeptContract.categoryExists.staticCall(1n);
    console.log(`   categoryExists(1) on GrievanceSystem.departmentManager() (${grievDept}): SUCCEEDED`);
  } catch (e) {
    console.log(`   categoryExists(1) on GrievanceSystem.departmentManager() (${grievDept}): REVERTED!`);
    console.log(`   Error: ${e.message}`);
    console.log(`   Return data: ${e.data || '<empty>'}`);
  }

  try {
    const realExists = await deptContract.categoryExists.staticCall(1n);
    console.log(`   categoryExists(1) on real DepartmentManager (${addresses.DepartmentManager}): SUCCEEDED (${realExists})`);
  } catch (e) {
    console.log(`   categoryExists(1) on real DepartmentManager: REVERTED! ${e.message}`);
  }
}

main().catch(console.error);
