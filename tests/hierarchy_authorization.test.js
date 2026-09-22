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
  console.log("RUNNING HIERARCHY, LIFECYCLE & NEGATIVE AUTHORIZATION TESTS");
  console.log("==================================================================");

  const ganacheProvider = ganache.provider({
    wallet: { totalAccounts: 10, defaultBalance: 1000 },
    logging: { quiet: true }
  });

  const provider = new ethers.BrowserProvider(ganacheProvider);

  // Intercept eth_estimateGas to add 50% safety buffer for all contract transactions
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
  const officerB = await provider.getSigner(4);
  const citizenA = await provider.getSigner(5);
  const citizenB = await provider.getSigner(6);

  // 1. Deploy contracts
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

  // Setup roles
  await (await roleManager.connect(superAdmin).grantDepartmentAdminRole(deptAdminA.address)).wait();
  await (await roleManager.connect(superAdmin).grantDepartmentAdminRole(deptAdminB.address)).wait();
  await (await roleManager.connect(superAdmin).grantOfficerRole(officerA.address)).wait();
  await (await roleManager.connect(superAdmin).grantOfficerRole(officerB.address)).wait();

  // Create Departments A and B
  await (await deptManager.connect(superAdmin).createDepartment("Sanitation Dept", deptAdminA.address)).wait(); // Dept 1
  await (await deptManager.connect(superAdmin).createDepartment("Water Dept", deptAdminB.address)).wait();      // Dept 2

  // Create Categories
  await (await deptManager.connect(superAdmin)["createCategory(string,string)"]("Waste", "Garbage collection")).wait();          // Cat 1
  await (await deptManager.connect(superAdmin)["createCategory(string,string)"]("Leaks", "Water leaks")).wait();                 // Cat 2

  console.log("Contracts deployed and basic entities created.\n");

  // TEST 1: Department Admin A adds officer to Dept A (allowed)
  await (await deptManager.connect(deptAdminA).addOfficerToDepartment(1, officerA.address)).wait();
  assert.strictEqual(await deptManager.isOfficerInDepartment(1, officerA.address), true);
  console.log("✅ DeptAdmin A can add Officer A to Dept A");

  // TEST 2: Department Admin A adds officer to Dept B (negative test - MUST FAIL)
  try {
    await deptManager.connect(deptAdminA).addOfficerToDepartment(2, officerA.address);
    assert.fail("Should have reverted when DeptAdmin A touched Dept B");
  } catch (e) {
    assert(e.message.includes("Unauthorized") || e.message.includes("revert"));
    console.log("✅ DeptAdmin A cannot add officer to Dept B (Negative auth verified)");
  }

  // DeptAdmin B adds Officer B to Dept B
  await (await deptManager.connect(deptAdminB).addOfficerToDepartment(2, officerB.address)).wait();
  assert.strictEqual(await deptManager.isOfficerInDepartment(2, officerB.address), true);

  // TEST 3: Permissionless citizen grievance creation (Citizen A submits without prior registerCitizen())
  const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("Test Citizen Grievance"));
  const tx1 = await grievanceSystem.connect(citizenA).createGrievance(
    1, 1, 1, "Pothole problem", "QmTestCid1", dummyHash
  );
  await tx1.wait();
  assert.strictEqual(await grievanceSystem.getGrievanceCount(), 1n);
  const g1 = await grievanceSystem.getGrievance(1);
  assert.strictEqual(g1.citizen, citizenA.address);
  console.log("✅ Citizen A can create grievance without separate registerCitizen() step");

  // TEST 4: DeptAdmin A assigns grievance in Dept A (allowed)
  await (await grievanceSystem.connect(deptAdminA).registerGrievance(1)).wait();
  await (await grievanceSystem.connect(deptAdminA).assignOfficer(1, officerA.address)).wait();
  assert.strictEqual((await grievanceSystem.getGrievance(1)).assignedOfficer, officerA.address);
  console.log("✅ DeptAdmin A can assign officer to Dept A grievance");

  // TEST 5: DeptAdmin B tries to reassign or modify Dept A grievance (negative test - MUST FAIL)
  try {
    await grievanceSystem.connect(deptAdminB).reassignOfficer(1, officerB.address);
    assert.fail("DeptAdmin B should not be able to assign in Dept A");
  } catch (e) {
    assert(e.message.includes("Unauthorized") || e.message.includes("revert"));
    console.log("✅ DeptAdmin B cannot reassign grievance in Dept A (Negative auth verified)");
  }

  // TEST 6: Officer A starts investigation on assigned grievance
  await (await grievanceSystem.connect(officerA).startReview(1)).wait();
  await (await grievanceSystem.connect(officerA).startInvestigation(1)).wait();
  console.log("✅ Officer A can start investigation on assigned grievance");

  // TEST 7: Officer B tries to modify Officer A's assigned grievance (negative test - MUST FAIL)
  try {
    await grievanceSystem.connect(officerB).addInvestigationNote(1, "QmFakeNote", dummyHash);
    assert.fail("Officer B should not be able to add note to Officer A's grievance");
  } catch (e) {
    assert(e.message.includes("NotAssignedOfficer") || e.message.includes("Unauthorized") || e.message.includes("revert"));
    console.log("✅ Officer B cannot modify Officer A's grievance (Negative auth verified)");
  }

  // TEST 8: Officer A submits resolution
  const resHash = ethers.keccak256(ethers.toUtf8Bytes("Resolution Fixed"));
  await (await grievanceSystem.connect(officerA).submitResolution(1, "QmResCid", resHash)).wait();
  console.log("✅ Officer A submitted resolution");

  // TEST 9: Citizen B tries to accept Citizen A's grievance resolution (negative test - MUST FAIL)
  try {
    await grievanceSystem.connect(citizenB).acceptResolution(1);
    assert.fail("Citizen B should not be able to accept Citizen A's grievance");
  } catch (e) {
    assert(e.message.includes("NotGrievanceOwner") || e.message.includes("Unauthorized") || e.message.includes("revert"));
    console.log("✅ Citizen B cannot accept Citizen A's grievance (Negative auth verified)");
  }

  // Citizen A accepts their own grievance
  await (await grievanceSystem.connect(citizenA).acceptResolution(1)).wait();
  await (await grievanceSystem.connect(citizenA).closeGrievance(1)).wait();
  console.log("✅ Citizen A accepts and closes own grievance");

  // TEST 10: Category Deactivation & Reactivation Lifecycle
  assert.strictEqual(await deptManager.isCategoryActive(1), true);
  await (await deptManager.connect(superAdmin).deactivateCategory(1)).wait();
  assert.strictEqual(await deptManager.isCategoryActive(1), false);
  console.log("✅ Category 1 deactivated successfully");

  // Creating grievance with deactivated category must fail
  try {
    await grievanceSystem.connect(citizenA).createGrievance(1, 1, 1, "Fails", "QmFail", dummyHash);
    assert.fail("Should not allow grievance creation with deactivated category");
  } catch (e) {
    assert(e.message.includes("CategoryNotActive") || e.message.includes("revert"));
    console.log("✅ Grievance creation rejected for deactivated category");
  }

  // Reactivate category 1
  await (await deptManager.connect(superAdmin).reactivateCategory(1)).wait();
  assert.strictEqual(await deptManager.isCategoryActive(1), true);
  console.log("✅ Category 1 reactivated successfully");

  // TEST 11: Department Deactivation & Reactivation Lifecycle
  assert.strictEqual(await deptManager.isDepartmentActive(2), true);
  await (await deptManager.connect(superAdmin).deactivateDepartment(2)).wait();
  assert.strictEqual(await deptManager.isDepartmentActive(2), false);
  console.log("✅ Department 2 deactivated successfully");

  // Reactivate department 2
  await (await deptManager.connect(superAdmin).reactivateDepartment(2)).wait();
  assert.strictEqual(await deptManager.isDepartmentActive(2), true);
  console.log("✅ Department 2 reactivated successfully");

  // TEST 12: Admin removal & DeptAdmin query helpers
  await (await deptManager.connect(superAdmin).removeDepartmentAdmin(2)).wait();
  assert.strictEqual(await deptManager.getDepartmentAdmin(2), ethers.ZeroAddress);
  console.log("✅ Department Admin removed from Department 2 successfully");

  // Query admin departments
  const adminADepts = await deptManager.getAdminDepartments(deptAdminA.address);
  assert.strictEqual(adminADepts.length, 1);
  assert.strictEqual(Number(adminADepts[0]), 1);
  console.log("✅ getAdminDepartments returns correct list for DeptAdmin A");

  // TEST 13: Officer transfer between departments
  await (await deptManager.connect(deptAdminA).transferOfficerDepartment(officerA.address, 1, 2)).wait();
  assert.strictEqual(await deptManager.isOfficerInDepartment(1, officerA.address), false);
  assert.strictEqual(await deptManager.isOfficerInDepartment(2, officerA.address), true);
  console.log("✅ Officer A transferred from Department 1 to Department 2");

  // TEST 14: Administrative Grievance Rejection
  const tx2 = await grievanceSystem.connect(citizenB).createGrievance(
    2, 2, 0, "Spam issue", "QmSpam", dummyHash
  );
  await tx2.wait();
  await (await grievanceSystem.connect(superAdmin).rejectGrievance(2, "Invalid spam complaint")).wait();
  const g2 = await grievanceSystem.getGrievance(2);
  assert.strictEqual(Number(g2.status), 9); // Status.REJECTED is 9
  console.log("✅ Grievance #2 administratively rejected with reason");

  // TEST 15: View index getters (getCitizenGrievances, getDepartmentGrievances)
  const citizenAGrievances = await grievanceSystem.getCitizenGrievances(citizenA.address);
  assert.strictEqual(citizenAGrievances.length, 1);
  assert.strictEqual(Number(citizenAGrievances[0]), 1);

  const dept1Grievances = await grievanceSystem.getDepartmentGrievances(1);
  assert.strictEqual(dept1Grievances.length, 1);
  assert.strictEqual(Number(dept1Grievances[0]), 1);
  console.log("✅ getCitizenGrievances & getDepartmentGrievances return expected arrays");

  console.log("\n==================================================================");
  console.log("ALL 15 HIERARCHY & LIFECYCLE TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runTests().catch(err => {
  console.error("Hierarchy tests failed:", err);
  process.exit(1);
});
