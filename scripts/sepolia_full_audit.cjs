const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://gateway.tenderly.co/public/sepolia';

const buildDir = path.join(__dirname, '..', 'build');
function loadAbi(name) {
  const file = path.join(buildDir, `${name}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.abi;
}

const RoleManagerAbi = loadAbi('RoleManager');
const DepartmentManagerAbi = loadAbi('DepartmentManager');
const GrievanceSystemAbi = loadAbi('GrievanceSystem');
const EscalationManagerAbi = loadAbi('EscalationManager');
const AuditTrailAbi = loadAbi('AuditTrail');

const ADDRESSES = {
  RoleManager: '0x2e9F0205712d901E8034695c0825DDF8b4870e64',
  DepartmentManager: '0x653e0F0D8C7dD9C26eA02EB5cac513A9556707Bd',
  GrievanceSystem: '0x0c6374763bf25875E503B809e559bB37A428Ff04',
  GrievanceSystem_Prompt: '0xc6C374763bf25875E503B809e559bB374A28fF04',
  EscalationManager: '0xCdC42E0c21b25D6a9accE526D05075316dcBa563',
  AuditTrail: '0x7ae2779953D1947D5B974dD07b1fAE241A5e744A',
};

const ACCOUNTS = {
  Account1: '0x9a93E885ee877f133c00ee262c4bbacf3d804149',
  Account2: '0x0eae67CF85206Bc3EbEf794059b6Aa2D6ce62C3b',
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 11155111, { staticNetwork: true });

  console.log('================================================================');
  console.log('TASK 1 — BYTECODE & WIRING VERIFICATION');
  console.log('================================================================');
  for (const [name, addr] of Object.entries(ADDRESSES)) {
    try {
      const code = await provider.getCode(addr.toLowerCase());
      console.log(`${name.padEnd(25)} (${addr}): codeLength=${code.length} (hasBytecode: ${code.length > 2})`);
    } catch (e) {
      console.log(`${name.padEnd(25)} (${addr}): ERROR ${e.message}`);
    }
  }

  const roleManager = new ethers.Contract(ADDRESSES.RoleManager, RoleManagerAbi, provider);
  const deptManager = new ethers.Contract(ADDRESSES.DepartmentManager, DepartmentManagerAbi, provider);
  const grievanceSystem = new ethers.Contract(ADDRESSES.GrievanceSystem, GrievanceSystemAbi, provider);
  const escManager = new ethers.Contract(ADDRESSES.EscalationManager, EscalationManagerAbi, provider);
  const auditTrail = new ethers.Contract(ADDRESSES.AuditTrail, AuditTrailAbi, provider);

  console.log('\n--- CONTRACT WIRING / REFERENCES ---');
  async function checkRef(label, callPromise, expected) {
    try {
      const actual = await callPromise;
      const match = actual.toLowerCase() === expected.toLowerCase();
      console.log(`${label.padEnd(45)}: ${actual} (expected: ${expected}) [${match ? 'CORRECT' : 'MISMATCH!'}]`);
      return actual;
    } catch (e) {
      console.log(`${label.padEnd(45)}: FAILED (${e.message})`);
      return null;
    }
  }

  await checkRef('DepartmentManager.roleManager()', deptManager.roleManager(), ADDRESSES.RoleManager);
  await checkRef('DepartmentManager.auditTrail()', deptManager.auditTrail(), ADDRESSES.AuditTrail);

  await checkRef('GrievanceSystem.roleManager()', grievanceSystem.roleManager(), ADDRESSES.RoleManager);
  await checkRef('GrievanceSystem.departmentManager()', grievanceSystem.departmentManager(), ADDRESSES.DepartmentManager);
  await checkRef('GrievanceSystem.auditTrail()', grievanceSystem.auditTrail(), ADDRESSES.AuditTrail);
  await checkRef('GrievanceSystem.escalationManager()', grievanceSystem.escalationManager(), ADDRESSES.EscalationManager);

  await checkRef('EscalationManager.roleManager()', escManager.roleManager(), ADDRESSES.RoleManager);
  await checkRef('EscalationManager.departmentManager()', escManager.departmentManager(), ADDRESSES.DepartmentManager);
  await checkRef('EscalationManager.grievanceSystem()', escManager.grievanceSystem(), ADDRESSES.GrievanceSystem);
  await checkRef('EscalationManager.auditTrail()', escManager.auditTrail(), ADDRESSES.AuditTrail);

  await checkRef('AuditTrail.roleManager()', auditTrail.roleManager(), ADDRESSES.RoleManager);

  console.log('\n--- AUDIT TRAIL AUTHORIZED WRITERS ---');
  for (const [name, addr] of [
    ['RoleManager', ADDRESSES.RoleManager],
    ['DepartmentManager', ADDRESSES.DepartmentManager],
    ['GrievanceSystem (.env)', ADDRESSES.GrievanceSystem],
    ['GrievanceSystem (Prompt)', ADDRESSES.GrievanceSystem_Prompt],
    ['EscalationManager', ADDRESSES.EscalationManager]
  ]) {
    try {
      const isAuth = await auditTrail.isAuthorizedWriter(addr);
      console.log(`AuditTrail.isAuthorizedWriter(${name.padEnd(25)} ${addr}): ${isAuth ? 'YES (AUTHORIZED)' : 'NO (NOT AUTHORIZED!)'}`);
    } catch (e) {
      console.log(`AuditTrail.isAuthorizedWriter(${name}): ERROR ${e.message}`);
    }
  }

  console.log('\n================================================================');
  console.log('TASK 2 — VERIFY ROLE STATE');
  console.log('================================================================');
  const SUPER_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SUPER_ADMIN_ROLE"));
  const DEPARTMENT_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEPARTMENT_ADMIN_ROLE"));
  const OFFICER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OFFICER_ROLE"));
  const CITIZEN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CITIZEN_ROLE"));

  // Check all accounts
  const accountsToCheck = { ...ACCOUNTS };

  // Read all departments from DepartmentManager
  const deptCount = Number(await deptManager.getDepartmentCount());
  console.log(`Total departments in DepartmentManager: ${deptCount}`);
  for (let d = 1; d <= deptCount; d++) {
    const dept = await deptManager.getDepartment(d);
    console.log(`Dept #${d}: Name="${dept.name}", Admin=${dept.admin}, Active=${dept.isActive}`);
    if (dept.admin && dept.admin !== ethers.ZeroAddress) {
      accountsToCheck[`Dept_${d}_Admin`] = dept.admin;
    }
    const officers = await deptManager.getDepartmentOfficers(d);
    console.log(`Dept #${d} Officers: [${officers.join(', ')}]`);
    officers.forEach((off, idx) => {
      accountsToCheck[`Dept_${d}_Officer_${idx+1}`] = off;
    });
  }

  // Also check deployer of RoleManager
  // We can check if Account1 is deployer
  console.log('\n--- Checking roles for each account ---');
  for (const [name, addr] of Object.entries(accountsToCheck)) {
    const cleanAddr = addr.toLowerCase();
    console.log(`\nAccount ${name}: ${addr} (${cleanAddr})`);
    const isSuper = await roleManager.hasRole(SUPER_ADMIN_ROLE, cleanAddr);
    const isDeptAdmin = await roleManager.hasRole(DEPARTMENT_ADMIN_ROLE, cleanAddr);
    const isOfficer = await roleManager.hasRole(OFFICER_ROLE, cleanAddr);
    const isCitizen = await roleManager.hasRole(CITIZEN_ROLE, cleanAddr);
    let isReg = false;
    let regAt = 0;
    try {
      const prof = await roleManager.getUserProfile(cleanAddr);
      isReg = prof.isRegistered;
      regAt = Number(prof.registeredAt);
    } catch (e) {}

    let activeRoles = [];
    try {
      activeRoles = await roleManager.getActiveRoles(cleanAddr);
    } catch (e) {
      activeRoles = [`error: ${e.message}`];
    }

    console.log(`  SUPER_ADMIN_ROLE:      ${isSuper}`);
    console.log(`  DEPARTMENT_ADMIN_ROLE: ${isDeptAdmin}`);
    console.log(`  OFFICER_ROLE:          ${isOfficer}`);
    console.log(`  CITIZEN_ROLE:          ${isCitizen}`);
    console.log(`  isRegistered:          ${isReg} (registeredAt: ${regAt})`);
    console.log(`  getActiveRoles():      ${JSON.stringify(activeRoles)}`);
  }

  console.log('\n================================================================');
  console.log('TASK 3 — VERIFY DEPARTMENT #4');
  console.log('================================================================');
  if (deptCount >= 4) {
    const d4 = await deptManager.getDepartment(4);
    const isAct4 = await deptManager.isDepartmentActive(4);
    const admin4 = await deptManager.getDepartmentAdmin(4);
    console.log(`Department #4:`);
    console.log(`  Name:             "${d4.name}"`);
    console.log(`  Admin:            ${admin4}`);
    console.log(`  isActive:         ${isAct4}`);
    console.log(`  createdAt:        ${Number(d4.createdAt)}`);
    const adminHasDeptRole = await roleManager.hasRole(DEPARTMENT_ADMIN_ROLE, admin4);
    const adminHasSuperRole = await roleManager.hasRole(SUPER_ADMIN_ROLE, admin4);
    console.log(`  Admin has DEPARTMENT_ADMIN_ROLE: ${adminHasDeptRole}`);
    console.log(`  Admin has SUPER_ADMIN_ROLE:      ${adminHasSuperRole}`);
  } else {
    console.log(`Department #4 DOES NOT EXIST! Total departments: ${deptCount}`);
  }

  console.log('\n================================================================');
  console.log('TASK 4 — VERIFY CATEGORIES (Looking for "Water")');
  console.log('================================================================');
  const catCount = Number(await deptManager.getCategoryCount());
  console.log(`Total categories in DepartmentManager: ${catCount}`);
  let waterCategory = null;
  for (let c = 1; c <= catCount; c++) {
    const cat = await deptManager.getCategory(c);
    const exists = await deptManager.categoryExists(c);
    const isActive = await deptManager.isCategoryActive(c);
    const catDept = await deptManager.getCategoryDepartment(c);
    console.log(`Category #${c}: Name="${cat.name}", DeptId=${catDept}, Exists=${exists}, Active=${isActive}`);
    if (cat.name.toLowerCase().includes('water')) {
      waterCategory = { id: c, name: cat.name, deptId: catDept, isActive, exists };
    }
  }

  if (waterCategory) {
    console.log(`\nFound Water Category:`, waterCategory);
  } else {
    console.log(`\nNo category named "Water" found among ${catCount} categories!`);
  }

  console.log('\n================================================================');
  console.log('TASK 5 & 6 — STATIC CALL / SIMULATION OF GRIEVANCE SUBMISSION');
  console.log('================================================================');
  // Form from user prompt:
  // Department: HealthCare (#4)
  // Category: Water
  // Priority: High Priority (2)
  const categoryIdToUse = waterCategory ? waterCategory.id : 1;
  const deptIdToUse = 4;
  const priorityToUse = 2; // High
  const titleToUse = 'Emergency Medical Water Contamination';
  const descriptionCidToUse = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
  const descriptionHashToUse = ethers.keccak256(ethers.toUtf8Bytes(descriptionCidToUse));

  console.log('Attempting static call to GrievanceSystem.createGrievance:');
  console.log(`  Target Contract:   ${ADDRESSES.GrievanceSystem}`);
  console.log(`  categoryId:        ${categoryIdToUse}`);
  console.log(`  departmentId:      ${deptIdToUse}`);
  console.log(`  priority:          ${priorityToUse}`);
  console.log(`  title:             "${titleToUse}"`);
  console.log(`  descriptionCid:    "${descriptionCidToUse}"`);
  console.log(`  descriptionHash:   ${descriptionHashToUse}`);

  // Test simulation from Account 1, Account 2, and a fresh address
  for (const [callerName, callerAddr] of [
    ['Account 1 (0x9a93...)', ACCOUNTS.Account1.toLowerCase()],
    ['Account 2 (0x0eae...)', ACCOUNTS.Account2.toLowerCase()],
    ['Random Address (0x1111...)', '0x1111111111111111111111111111111111111111'],
  ]) {
    for (const testDeptId of [4, 1]) {
      console.log(`\n--- Calling from ${callerName} with dept=${testDeptId} ---`);
      try {
        const result = await grievanceSystem.createGrievance.staticCall(
          categoryIdToUse,
          testDeptId,
          priorityToUse,
          titleToUse,
          descriptionCidToUse,
          descriptionHashToUse,
          { from: callerAddr }
        );
        console.log(`  -> SUCCESS! Result: grievanceId=${result.toString()}`);
      } catch (err) {
        console.log(`  -> REVERTED!`);
        console.log(`     Message:      ${err.message}`);
        console.log(`     Reason:       ${err.reason}`);
        console.log(`     Code:         ${err.code}`);

      // Try to extract raw revert data
      const rawData =
        err?.data ||
        err?.info?.error?.data ||
        err?.error?.data ||
        err?.payload?.params?.[0]?.data;
      console.log(`     Raw Data:     ${rawData}`);

      if (rawData && rawData !== '0x') {
        let decoded = false;
        for (const [cName, cContract] of [
          ['GrievanceSystem', grievanceSystem],
          ['DepartmentManager', deptManager],
          ['AuditTrail', auditTrail],
          ['RoleManager', roleManager],
        ]) {
          try {
            const parsed = cContract.interface.parseError(rawData);
            if (parsed) {
              console.log(`     >>> DECODED CUSTOM ERROR in ${cName}:`, parsed.name, JSON.stringify(parsed.args));
              decoded = true;
              break;
            }
          } catch (e) {}
        }
        if (!decoded) {
          console.log(`     Could not parse error selector: ${rawData.slice(0, 10)}`);
        }
      } else {
        console.log(`     No revert data returned (empty revert / likely require(false)).`);
      }
    }
  }
}
}

main().catch(console.error);
