const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Contract ABIs
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

// Addresses from prompt and frontend/.env
const ADDRESSES = {
  RoleManager: '0x2e9F0205712d901E8034695c0825DDF8b4870e64',
  DepartmentManager: '0x653e0F0D8C7dD9C26eA02EB5cac513A9556707Bd',
  GrievanceSystem_Prompt: '0xc6C374763bf25875E503B809e559bB374A28fF04',
  GrievanceSystem_Env: '0x0c6374763bf25875E503B809e559bB37A428Ff04',
  EscalationManager: '0xCdC42E0c21b25D6a9accE526D05075316dcBa563',
  AuditTrail: '0x7ae2779953D1947D5B974dD07b1fAE241A5e744A',
};

const ACCOUNTS = {
  Account1: '0x9a93E885ee877f133c00ee262c4bbacf3d804149',
  Account2: '0x0eae67CF85206Bc3EbEf794059b6Aa2D6ce62C3b',
};

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

async function main() {
  console.log('Connecting to Sepolia via', RPC_URL);
  const provider = new ethers.JsonRpcProvider(RPC_URL, 11155111, { staticNetwork: true });

  console.log('================================================================');
  console.log('TASK 1 — BYTECODE & WIRING VERIFICATION');
  console.log('================================================================');
  for (const [name, addr] of Object.entries(ADDRESSES)) {
    try {
      const normalizedAddr = addr.toLowerCase();
      const code = await provider.getCode(normalizedAddr);
      const hasBytecode = code && code !== '0x' && code !== '0x0';
      let checksumAddr = 'invalid';
      try { checksumAddr = ethers.getAddress(normalizedAddr); } catch(e){}
      console.log(`[Bytecode] ${name.padEnd(25)} (${addr}): ${hasBytecode ? `EXISTS (${code.length} hex chars)` : 'MISSING / EMPTY'} | Checksum: ${checksumAddr}`);
    } catch (e) {
      console.error(`Error for ${name} (${addr}):`, e.message);
    }
  }

  // Determine active GrievanceSystem address
  let activeGrievanceSystemAddr = ADDRESSES.GrievanceSystem_Prompt.toLowerCase();
  try {
    const promptCode = await provider.getCode(ADDRESSES.GrievanceSystem_Prompt.toLowerCase());
    const envCode = await provider.getCode(ADDRESSES.GrievanceSystem_Env.toLowerCase());
    console.log(`Prompt GrievanceSystem code len: ${promptCode.length}, Env GrievanceSystem code len: ${envCode.length}`);
    if (promptCode.length > 2) {
      activeGrievanceSystemAddr = ADDRESSES.GrievanceSystem_Prompt.toLowerCase();
    } else if (envCode.length > 2) {
      activeGrievanceSystemAddr = ADDRESSES.GrievanceSystem_Env.toLowerCase();
    }
  } catch (e) {
    console.error('Error checking GrievanceSystem code:', e.message);
  }

  // Contract instances
  const roleManager = new ethers.Contract(ADDRESSES.RoleManager, RoleManagerAbi, provider);
  const deptManager = new ethers.Contract(ADDRESSES.DepartmentManager, DepartmentManagerAbi, provider);
  const grievanceSystem = new ethers.Contract(activeGrievanceSystemAddr, GrievanceSystemAbi, provider);
  const escManager = new ethers.Contract(ADDRESSES.EscalationManager, EscalationManagerAbi, provider);
  const auditTrail = new ethers.Contract(ADDRESSES.AuditTrail, AuditTrailAbi, provider);

  console.log('\n--- REFERENCE / WIRING CHECK ---');
  try {
    const dmRole = await deptManager.roleManager();
    console.log(`DepartmentManager.roleManager():    ${dmRole} (matches: ${dmRole.toLowerCase() === ADDRESSES.RoleManager.toLowerCase()})`);
  } catch (e) { console.log('DepartmentManager.roleManager() error:', e.message); }

  try {
    const dmAudit = await deptManager.auditTrail();
    console.log(`DepartmentManager.auditTrail():      ${dmAudit} (matches: ${dmAudit.toLowerCase() === ADDRESSES.AuditTrail.toLowerCase()})`);
  } catch (e) { console.log('DepartmentManager.auditTrail() error:', e.message); }

  try {
    const gsRole = await grievanceSystem.roleManager();
    console.log(`GrievanceSystem.roleManager():        ${gsRole} (matches: ${gsRole.toLowerCase() === ADDRESSES.RoleManager.toLowerCase()})`);
  } catch (e) { console.log('GrievanceSystem.roleManager() error:', e.message); }

  try {
    const gsDept = await grievanceSystem.departmentManager();
    console.log(`GrievanceSystem.departmentManager():  ${gsDept} (matches: ${gsDept.toLowerCase() === ADDRESSES.DepartmentManager.toLowerCase()})`);
  } catch (e) { console.log('GrievanceSystem.departmentManager() error:', e.message); }

  try {
    const gsAudit = await grievanceSystem.auditTrail();
    console.log(`GrievanceSystem.auditTrail():        ${gsAudit} (matches: ${gsAudit.toLowerCase() === ADDRESSES.AuditTrail.toLowerCase()})`);
  } catch (e) { console.log('GrievanceSystem.auditTrail() error:', e.message); }

  try {
    const gsEsc = await grievanceSystem.escalationManager();
    console.log(`GrievanceSystem.escalationManager():  ${gsEsc} (matches: ${gsEsc.toLowerCase() === ADDRESSES.EscalationManager.toLowerCase()})`);
  } catch (e) { console.log('GrievanceSystem.escalationManager() error:', e.message); }

  try {
    const emRole = await escManager.roleManager();
    console.log(`EscalationManager.roleManager():      ${emRole} (matches: ${emRole.toLowerCase() === ADDRESSES.RoleManager.toLowerCase()})`);
  } catch (e) { console.log('EscalationManager.roleManager() error:', e.message); }

  try {
    const emDept = await escManager.departmentManager();
    console.log(`EscalationManager.departmentManager():${emDept} (matches: ${emDept.toLowerCase() === ADDRESSES.DepartmentManager.toLowerCase()})`);
  } catch (e) { console.log('EscalationManager.departmentManager() error:', e.message); }

  try {
    const emGs = await escManager.grievanceSystem();
    console.log(`EscalationManager.grievanceSystem():  ${emGs} (matches: ${emGs.toLowerCase() === activeGrievanceSystemAddr.toLowerCase()})`);
  } catch (e) { console.log('EscalationManager.grievanceSystem() error:', e.message); }

  try {
    const emAudit = await escManager.auditTrail();
    console.log(`EscalationManager.auditTrail():      ${emAudit} (matches: ${emAudit.toLowerCase() === ADDRESSES.AuditTrail.toLowerCase()})`);
  } catch (e) { console.log('EscalationManager.auditTrail() error:', e.message); }

  try {
    const atRole = await auditTrail.roleManager();
    console.log(`AuditTrail.roleManager():             ${atRole} (matches: ${atRole.toLowerCase() === ADDRESSES.RoleManager.toLowerCase()})`);
  } catch (e) { console.log('AuditTrail.roleManager() error:', e.message); }

  console.log('\n--- AUDIT TRAIL AUTHORIZED WRITERS ---');
  for (const [name, addr] of [
    ['RoleManager', ADDRESSES.RoleManager],
    ['DepartmentManager', ADDRESSES.DepartmentManager],
    ['GrievanceSystem_Prompt', ADDRESSES.GrievanceSystem_Prompt],
    ['GrievanceSystem_Env', ADDRESSES.GrievanceSystem_Env],
    ['EscalationManager', ADDRESSES.EscalationManager],
  ]) {
    try {
      const isAuth = await auditTrail.isAuthorizedWriter(addr);
      console.log(`AuditTrail.isAuthorizedWriter(${name} - ${addr}): ${isAuth}`);
    } catch (e) {
      console.log(`AuditTrail.isAuthorizedWriter(${name}) error:`, e.message);
    }
  }

  console.log('\n================================================================');
  console.log('TASK 2 — VERIFY ROLE STATE');
  console.log('================================================================');
  const SUPER_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SUPER_ADMIN_ROLE"));
  const DEPARTMENT_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEPARTMENT_ADMIN_ROLE"));
  const OFFICER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OFFICER_ROLE"));
  const CITIZEN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CITIZEN_ROLE"));

  const accountsToCheck = {
    ...ACCOUNTS,
  };

  // Find other accounts from DepartmentManager
  try {
    const deptCount = Number(await deptManager.getDepartmentCount());
    console.log(`Total departments on DepartmentManager: ${deptCount}`);
    for (let i = 1; i <= deptCount; i++) {
      const d = await deptManager.getDepartment(i);
      console.log(`Dept #${i}: Name="${d.name}", Admin=${d.admin}, Active=${d.isActive}`);
      if (d.admin && d.admin !== ethers.ZeroAddress) {
        accountsToCheck[`Dept_${i}_Admin`] = d.admin;
      }
      try {
        const officers = await deptManager.getDepartmentOfficers(i);
        console.log(`Dept #${i} officers count: ${officers.length}`);
        officers.forEach((off, idx) => {
          accountsToCheck[`Dept_${i}_Officer_${idx+1}`] = off;
        });
      } catch (err) {
        console.log(`Dept #${i} getDepartmentOfficers error:`, err.message);
      }
    }
  } catch (e) {
    console.log('Error reading departments:', e.message);
  }

  console.log('\nChecking roles for accounts:');
  for (const [label, accountAddr] of Object.entries(accountsToCheck)) {
    console.log(`\nAccount: ${label} (${accountAddr})`);
    try {
      const hasSuper = await roleManager.hasRole(SUPER_ADMIN_ROLE, accountAddr);
      const hasDeptAdmin = await roleManager.hasRole(DEPARTMENT_ADMIN_ROLE, accountAddr);
      const hasOfficer = await roleManager.hasRole(OFFICER_ROLE, accountAddr);
      const hasCitizen = await roleManager.hasRole(CITIZEN_ROLE, accountAddr);
      let isReg = false;
      try {
        const prof = await roleManager.getUserProfile(accountAddr);
        isReg = prof.isRegistered;
      } catch {}
      console.log(`  SUPER_ADMIN_ROLE:      ${hasSuper}`);
      console.log(`  DEPARTMENT_ADMIN_ROLE: ${hasDeptAdmin}`);
      console.log(`  OFFICER_ROLE:          ${hasOfficer}`);
      console.log(`  CITIZEN_ROLE:          ${hasCitizen}`);
      console.log(`  isRegistered:          ${isReg}`);
      try {
        const roles = await roleManager.getActiveRoles(accountAddr);
        console.log(`  getActiveRoles():      ${JSON.stringify(roles)}`);
      } catch (e) {
        console.log(`  getActiveRoles() error:`, e.message);
      }
    } catch (e) {
      console.log(`  Error querying roles:`, e.message);
    }
  }

  console.log('\n================================================================');
  console.log('TASK 3 — VERIFY DEPARTMENT #4');
  console.log('================================================================');
  try {
    const dept4 = await deptManager.getDepartment(4);
    const isAct4 = await deptManager.isDepartmentActive(4);
    const admin4 = await deptManager.getDepartmentAdmin(4);
    console.log('getDepartment(4):', dept4);
    console.log('isDepartmentActive(4):', isAct4);
    console.log('getDepartmentAdmin(4):', admin4);
    const adminHasDeptAdminRole = await roleManager.hasRole(DEPARTMENT_ADMIN_ROLE, admin4);
    const adminHasSuperAdminRole = await roleManager.hasRole(SUPER_ADMIN_ROLE, admin4);
    console.log(`Dept #4 Admin role check in RoleManager: DEPARTMENT_ADMIN=${adminHasDeptAdminRole}, SUPER_ADMIN=${adminHasSuperAdminRole}`);
  } catch (e) {
    console.log('Task 3 check failed:', e.message);
  }

  console.log('\n================================================================');
  console.log('TASK 4 — VERIFY CATEGORIES (Including "Water")');
  console.log('================================================================');
  try {
    const catCount = Number(await deptManager.getCategoryCount());
    console.log(`Total categories in DepartmentManager: ${catCount}`);
    for (let c = 1; c <= catCount; c++) {
      try {
        const cat = await deptManager.getCategory(c);
        const exists = await deptManager.categoryExists(c);
        const isActive = await deptManager.isCategoryActive(c);
        const catDept = await deptManager.getCategoryDepartment(c);
        console.log(`Category #${c}: Name="${cat.name}", DeptId=${catDept}, Exists=${exists}, Active=${isActive}, RawDept=${cat.departmentId}`);
      } catch (err) {
        console.log(`Error reading Category #${c}:`, err.message);
      }
    }
  } catch (e) {
    console.log('Task 4 check failed:', e.message);
  }

  console.log('\n================================================================');
  console.log('TASK 6 — SIMULATE GRIEVANCE SUBMISSION WITH STATIC CALL');
  console.log('================================================================');
  // Simulate from Account 1, Account 2, or a random citizen
  // Parameters: categoryId, departmentId, priority, title, descriptionCid, descriptionHash
  // Let's test calling createGrievance on GrievanceSystem!
  // From prompt: Department: HealthCare (#4), Category: Water, Priority: High Priority (2)
  const testCategory = 1; // we'll find Water's actual ID or check what ID exists
  const testDept = 4;
  const testPriority = 2; // HIGH
  const testTitle = 'Water Supply Interruption in Ward 4';
  const testCid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
  const testHash = ethers.keccak256(ethers.toUtf8Bytes(testCid));

  // Test callers: Account1 (deployer), Account2, random citizen
  const testCallers = [
    { name: 'Account 1 (Deployer)', address: ACCOUNTS.Account1 },
    { name: 'Account 2', address: ACCOUNTS.Account2 },
    { name: 'Random Nonce Address', address: '0x1111111111111111111111111111111111111111' }
  ];

  for (const caller of testCallers) {
    console.log(`\n--- Simulating createGrievance call from ${caller.name} (${caller.address}) ---`);
    console.log(`Params: cat=${testCategory}, dept=${testDept}, priority=${testPriority}, title="${testTitle}", cid="${testCid}", hash="${testHash}"`);
    
    // We try on both Prompt address and Env address
    for (const [gsName, gsAddr] of [
      ['Prompt GrievanceSystem', ADDRESSES.GrievanceSystem_Prompt],
      ['Env GrievanceSystem', ADDRESSES.GrievanceSystem_Env]
    ]) {
      console.log(`Testing against ${gsName} (${gsAddr}):`);
      const gs = new ethers.Contract(gsAddr, GrievanceSystemAbi, provider);
      try {
        const res = await gs.createGrievance.staticCall(
          testCategory,
          testDept,
          testPriority,
          testTitle,
          testCid,
          testHash,
          { from: caller.address }
        );
        console.log(`  -> SUCCESS! Static call returned grievanceId: ${res.toString()}`);
      } catch (err) {
        console.log(`  -> REVERTED!`);
        console.log(`     Error message: ${err.message}`);
        console.log(`     Error reason:  ${err.reason}`);
        console.log(`     Error code:    ${err.code}`);
        const rawData = err?.data || err?.info?.error?.data || err?.error?.data;
        console.log(`     Raw revert data: ${rawData}`);
        if (rawData && rawData !== '0x') {
          try {
            const parsed = gs.interface.parseError(rawData);
            console.log(`     Decoded with GrievanceSystem interface:`, parsed.name, parsed.args);
          } catch (e1) {
            try {
              const parsedDept = deptManager.interface.parseError(rawData);
              console.log(`     Decoded with DepartmentManager interface:`, parsedDept.name, parsedDept.args);
            } catch (e2) {
              try {
                const parsedAudit = auditTrail.interface.parseError(rawData);
                console.log(`     Decoded with AuditTrail interface:`, parsedAudit.name, parsedAudit.args);
              } catch (e3) {
                try {
                  const parsedRole = roleManager.interface.parseError(rawData);
                  console.log(`     Decoded with RoleManager interface:`, parsedRole.name, parsedRole.args);
                } catch (e4) {
                  console.log(`     Could not decode error data with any known contract interface.`);
                }
              }
            }
          }
        }
      }
    }
  }
}

main().catch(console.error);
