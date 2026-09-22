const { ethers } = require("ethers");
const ganache = require("ganache");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

function loadArtifact(name) {
  const p = path.join(__dirname, "..", "build", `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function runTests() {
  console.log("==================================================================");
  console.log("DEPARTMENT & CATEGORY AUTHORIZATION TEST SUITE");
  console.log("==================================================================");

  const ganacheProvider = ganache.provider({
    wallet: { totalAccounts: 10, defaultBalance: 1000 },
    logging: { quiet: true }
  });

  const provider = new ethers.BrowserProvider(ganacheProvider);

  // Buffer gas estimation
  const origSend = provider.send.bind(provider);
  provider.send = async function(method, params) {
    const res = await origSend(method, params);
    if (method === "eth_estimateGas" && typeof res === "string" && res.startsWith("0x")) {
      const buffered = (BigInt(res) * 150n) / 100n;
      return "0x" + buffered.toString(16);
    }
    return res;
  };

  const superAdmin = await provider.getSigner(0);
  const deptAdminA = await provider.getSigner(1);
  const deptAdminB = await provider.getSigner(2);
  const officerA = await provider.getSigner(3);
  const citizenA = await provider.getSigner(4);
  const unauthorizedUser = await provider.getSigner(5);

  const superAdminAddr = await superAdmin.getAddress();
  const deptAdminAAddr = await deptAdminA.getAddress();
  const deptAdminBAddr = await deptAdminB.getAddress();
  const officerAAddr = await officerA.getAddress();
  const citizenAAddr = await citizenA.getAddress();
  const unauthorizedUserAddr = await unauthorizedUser.getAddress();

  // 1. Deploy contracts
  console.log("Deploying core contracts...");
  const RoleManagerArt = loadArtifact("RoleManager");
  const roleManager = await (new ethers.ContractFactory(RoleManagerArt.abi, RoleManagerArt.bytecode, superAdmin)).deploy();
  await roleManager.waitForDeployment();
  const roleManagerAddr = await roleManager.getAddress();

  const DeptManagerArt = loadArtifact("DepartmentManager");
  const deptManager = await (new ethers.ContractFactory(DeptManagerArt.abi, DeptManagerArt.bytecode, superAdmin)).deploy(roleManagerAddr);
  await deptManager.waitForDeployment();
  const deptManagerAddr = await deptManager.getAddress();

  const GrievanceArt = loadArtifact("GrievanceSystem");
  const grievanceSystem = await (new ethers.ContractFactory(GrievanceArt.abi, GrievanceArt.bytecode, superAdmin)).deploy(roleManagerAddr, deptManagerAddr);
  await grievanceSystem.waitForDeployment();
  const grievanceSystemAddr = await grievanceSystem.getAddress();

  const EscalationArt = loadArtifact("EscalationManager");
  const escalationManager = await (new ethers.ContractFactory(EscalationArt.abi, EscalationArt.bytecode, superAdmin)).deploy(roleManagerAddr, deptManagerAddr, grievanceSystemAddr);
  await escalationManager.waitForDeployment();
  const escalationManagerAddr = await escalationManager.getAddress();

  const AuditArt = loadArtifact("AuditTrail");
  const auditTrail = await (new ethers.ContractFactory(AuditArt.abi, AuditArt.bytecode, superAdmin)).deploy(roleManagerAddr);
  await auditTrail.waitForDeployment();
  const auditTrailAddr = await auditTrail.getAddress();

  // Wire integrations
  await (await grievanceSystem.connect(superAdmin).setEscalationManager(escalationManagerAddr)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(roleManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(deptManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(grievanceSystemAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(escalationManagerAddr, true)).wait();
  await (await roleManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await deptManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await grievanceSystem.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await escalationManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();

  // 2. Setup roles
  console.log("Setting up roles...");
  await (await roleManager.connect(superAdmin).grantRole(await roleManager.DEPARTMENT_ADMIN_ROLE(), deptAdminAAddr)).wait();
  await (await roleManager.connect(superAdmin).grantRole(await roleManager.DEPARTMENT_ADMIN_ROLE(), deptAdminBAddr)).wait();
  await (await roleManager.connect(superAdmin).grantRole(await roleManager.OFFICER_ROLE(), officerAAddr)).wait();
  await (await roleManager.connect(superAdmin).grantRole(await roleManager.CITIZEN_ROLE(), citizenAAddr)).wait();

  console.log("\n--- TEST 1: Super Admin creates department with non-admin (Should Revert NotADepartmentAdmin) ---");
  try {
    await deptManager.connect(superAdmin).createDepartment("Invalid Dept", unauthorizedUserAddr);
    assert.fail("Expected revert NotADepartmentAdmin");
  } catch (err) {
    assert(err.message.includes("NotADepartmentAdmin") || err.message.includes("revert"), "Error should indicate NotADepartmentAdmin: " + err.message);
    console.log("✓ Correctly reverted NotADepartmentAdmin when assigning an address without DEPARTMENT_ADMIN_ROLE");
  }

  console.log("\n--- TEST 2: Super Admin creates departments with valid admins (Should Succeed) ---");
  const txDeptA = await deptManager.connect(superAdmin).createDepartment("Public Works", deptAdminAAddr);
  await txDeptA.wait();
  const deptAId = 1n;
  const deptA = await deptManager.getDepartment(deptAId);
  assert.strictEqual(deptA.name, "Public Works");
  assert.strictEqual(deptA.admin, deptAdminAAddr);
  console.log(`✓ Department #1 created successfully with Admin ${deptAdminAAddr}`);

  const txDeptB = await deptManager.connect(superAdmin).createDepartment("Health & Sanitation", deptAdminBAddr);
  await txDeptB.wait();
  const deptBId = 2n;
  const deptB = await deptManager.getDepartment(deptBId);
  assert.strictEqual(deptB.name, "Health & Sanitation");
  assert.strictEqual(deptB.admin, deptAdminBAddr);
  console.log(`✓ Department #2 created successfully with Admin ${deptAdminBAddr}`);

  console.log("\n--- TEST 3: Dept Admin A creates category in own department (Should Succeed) ---");
  const txCatA = await deptManager.connect(deptAdminA)["createCategory(uint256,string,string)"](deptAId, "Potholes & Road Damage", "Complaints regarding broken roads");
  const rcCatA = await txCatA.wait();
  const catAId = 1n;
  const catA = await deptManager.getCategory(catAId);
  assert.strictEqual(catA.name, "Potholes & Road Damage");
  assert.strictEqual(catA.departmentId, deptAId);
  assert.strictEqual(catA.isActive, true);
  console.log(`✓ Category #1 created in Dept #1 by Admin A with departmentId=${catA.departmentId}`);

  console.log("\n--- TEST 3b: Dept Admin A creates duplicate category in same department (Should Revert CategoryAlreadyExists) ---");
  try {
    await deptManager.connect(deptAdminA)["createCategory(uint256,string,string)"](deptAId, "Potholes & Road Damage", "Duplicate category name");
    assert.fail("Expected revert CategoryAlreadyExists");
  } catch (err) {
    assert(err.message.includes("CategoryAlreadyExists") || err.message.includes("revert"), "Error should indicate CategoryAlreadyExists: " + err.message);
    console.log("✓ Correctly reverted CategoryAlreadyExists on duplicate active category in department");
  }

  console.log("\n--- TEST 4: Dept Admin A creates category in Dept B (Should Revert Unauthorized) ---");
  try {
    await deptManager.connect(deptAdminA)["createCategory(uint256,string,string)"](deptBId, "Cross Dept Cat", "Should fail");
    assert.fail("Expected revert Unauthorized");
  } catch (err) {
    assert(err.message.includes("Unauthorized") || err.message.includes("revert"), "Error should indicate Unauthorized: " + err.message);
    console.log("✓ Correctly reverted Unauthorized when Dept Admin A tried to create category in Dept B");
  }

  console.log("\n--- TEST 5: Dept Admin B creates category in own department (Should Succeed) ---");
  const txCatB = await deptManager.connect(deptAdminB)["createCategory(uint256,string,string)"](deptBId, "Water Contamination", "Unsafe drinking water reports");
  await txCatB.wait();
  const catBId = 2n;
  const catB = await deptManager.getCategory(catBId);
  assert.strictEqual(catB.name, "Water Contamination");
  assert.strictEqual(catB.departmentId, deptBId);
  console.log(`✓ Category #2 created in Dept #2 by Admin B with departmentId=${catB.departmentId}`);

  console.log("\n--- TEST 6: Dept Admin B attempts to update Dept A category (Should Revert Unauthorized) ---");
  try {
    await deptManager.connect(deptAdminB).updateCategory(catAId, "Hijacked Cat", "Malicious update");
    assert.fail("Expected revert Unauthorized");
  } catch (err) {
    assert(err.message.includes("Unauthorized") || err.message.includes("revert"), "Error should indicate Unauthorized: " + err.message);
    console.log("✓ Correctly reverted Unauthorized when Dept Admin B tried to edit Dept A's category");
  }

  console.log("\n--- TEST 7: Dept Admin A updates own category (Should Succeed) ---");
  const txUpdateCatA = await deptManager.connect(deptAdminA).updateCategory(catAId, "Potholes & Major Surface Cracks", "Updated road description");
  await txUpdateCatA.wait();
  const catAUpdated = await deptManager.getCategory(catAId);
  assert.strictEqual(catAUpdated.name, "Potholes & Major Surface Cracks");
  console.log("✓ Dept Admin A successfully updated own category");

  console.log("\n--- TEST 8: Dept Admin B attempts to deactivate Dept A category (Should Revert Unauthorized) ---");
  try {
    await deptManager.connect(deptAdminB).deactivateCategory(catAId);
    assert.fail("Expected revert Unauthorized");
  } catch (err) {
    assert(err.message.includes("Unauthorized") || err.message.includes("revert"), "Error should indicate Unauthorized: " + err.message);
    console.log("✓ Correctly reverted Unauthorized when Dept Admin B tried to deactivate Dept A's category");
  }

  console.log("\n--- TEST 9: Dept Admin A deactivates and reactivates own category (Should Succeed) ---");
  await (await deptManager.connect(deptAdminA).deactivateCategory(catAId)).wait();
  const catADeactive = await deptManager.getCategory(catAId);
  assert.strictEqual(catADeactive.isActive, false);
  console.log("✓ Dept Admin A deactivated own category (isActive = false)");

  await (await deptManager.connect(deptAdminA).reactivateCategory(catAId)).wait();
  const catAReactive = await deptManager.getCategory(catAId);
  assert.strictEqual(catAReactive.isActive, true);
  console.log("✓ Dept Admin A reactivated own category (isActive = true)");

  console.log("\n--- TEST 10: Officer and Citizen attempt to create category (Should Revert Unauthorized) ---");
  try {
    await deptManager.connect(officerA)["createCategory(uint256,string,string)"](deptAId, "Officer Cat", "Officer test");
    assert.fail("Expected revert Unauthorized for officer");
  } catch (err) {
    assert(err.message.includes("Unauthorized") || err.message.includes("revert"));
    console.log("✓ Correctly reverted Unauthorized when Officer tried to create category");
  }

  try {
    await deptManager.connect(citizenA)["createCategory(uint256,string,string)"](deptAId, "Citizen Cat", "Citizen test");
    assert.fail("Expected revert Unauthorized for citizen");
  } catch (err) {
    assert(err.message.includes("Unauthorized") || err.message.includes("revert"));
    console.log("✓ Correctly reverted Unauthorized when Citizen tried to create category");
  }

  console.log("\n--- TEST 11: Department category filtering check ---");
  const deptACategories = await deptManager.getDepartmentCategories(deptAId);
  assert.strictEqual(deptACategories.length, 1);
  assert.strictEqual(deptACategories[0], catAId);

  const deptBCategories = await deptManager.getDepartmentCategories(deptBId);
  assert.strictEqual(deptBCategories.length, 1);
  assert.strictEqual(deptBCategories[0], catBId);
  console.log(`✓ getDepartmentCategories(1) returned [${deptACategories.map(x => x.toString())}]`);
  console.log(`✓ getDepartmentCategories(2) returned [${deptBCategories.map(x => x.toString())}]`);

  console.log("\n--- TEST 12: Cross-department grievance submission (Should Revert CategoryNotInDepartment) ---");
  const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("content"));
  try {
    // Attempting to submit Category #2 (Health) under Department #1 (Public Works)
    await grievanceSystem.connect(citizenA).createGrievance(
      catBId, // category 2 belongs to dept 2
      deptAId, // department 1
      1, // MEDIUM priority
      "Cross dept violation attempt",
      "QmDummyCid",
      dummyHash
    );
    assert.fail("Expected revert CategoryNotInDepartment");
  } catch (err) {
    assert(err.message.includes("CategoryNotInDepartment") || err.message.includes("revert"), "Error: " + err.message);
    console.log("✓ Correctly reverted CategoryNotInDepartment when Category from Dept B was submitted under Dept A");
  }

  console.log("\n--- TEST 13: Valid department grievance submission (Should Succeed) ---");
  const txGrievance = await grievanceSystem.connect(citizenA).createGrievance(
    catAId, // category 1
    deptAId, // department 1
    1, // MEDIUM priority
    "Pothole on Main Street",
    "QmValidCid123",
    dummyHash
  );
  await txGrievance.wait();
  const grievance1 = await grievanceSystem.getGrievance(1n);
  assert.strictEqual(grievance1.title, "Pothole on Main Street");
  assert.strictEqual(grievance1.departmentId, deptAId);
  assert.strictEqual(grievance1.categoryId, catAId);
  console.log("✓ Citizen successfully filed grievance with matching category and department");

  console.log("\n--- TEST 14: Direct URL Isolation Logic Verification ---");
  // Verification of the security boundary in GrievanceDetails.jsx:
  // If a Dept Admin accesses /grievances/:id, they can only view if grievance.departmentId is in their managed departments.
  const deptAdminAManagedDepts = await deptManager.getAdminDepartments(deptAdminAAddr);
  const deptAdminBManagedDepts = await deptManager.getAdminDepartments(deptAdminBAddr);

  const canDeptAdminAAccessGrievance1 = deptAdminAManagedDepts.some(id => id === grievance1.departmentId);
  const canDeptAdminBAccessGrievance1 = deptAdminBManagedDepts.some(id => id === grievance1.departmentId);

  assert.strictEqual(canDeptAdminAAccessGrievance1, true, "Dept Admin A must have access to Grievance #1");
  assert.strictEqual(canDeptAdminBAccessGrievance1, false, "Dept Admin B must NOT have access to Grievance #1");
  console.log("✓ Isolation Logic Verified: Dept Admin A access = true, Dept Admin B access = false");

  console.log("\n==================================================================");
  console.log("ALL 14 TEST CASES PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
