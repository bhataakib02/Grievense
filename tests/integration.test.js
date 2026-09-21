const { ethers } = require("ethers");
const ganache = require("ganache");
const path = require("path");
const fs = require("fs");

function loadArtifact(name) {
  const p = path.join(__dirname, "..", "build", `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const RoleManagerArtifact = loadArtifact("RoleManager");
const DepartmentManagerArtifact = loadArtifact("DepartmentManager");
const GrievanceSystemArtifact = loadArtifact("GrievanceSystem");
const EscalationManagerArtifact = loadArtifact("EscalationManager");
const AuditTrailArtifact = loadArtifact("AuditTrail");

// AuditAction enum values matching GrievanceTypes.sol
const AuditAction = {
  USER_REGISTERED: 0,
  ROLE_GRANTED: 1,
  ROLE_REVOKED: 2,
  DEPARTMENT_CREATED: 3,
  DEPARTMENT_UPDATED: 4,
  DEPARTMENT_DEACTIVATED: 5,
  OFFICER_ADDED: 6,
  OFFICER_REMOVED: 7,
  GRIEVANCE_CREATED: 8,
  GRIEVANCE_REGISTERED: 9,
  GRIEVANCE_ASSIGNED: 10,
  GRIEVANCE_REASSIGNED: 11,
  STATUS_CHANGED: 12,
  INVESTIGATION_STARTED: 13,
  INVESTIGATION_NOTE_ADDED: 14,
  EVIDENCE_ADDED: 15,
  EVIDENCE_REVOKED: 16,
  RESOLUTION_SUBMITTED: 17,
  RESOLUTION_ACCEPTED: 18,
  RESOLUTION_REJECTED: 19,
  GRIEVANCE_REOPENED: 20,
  GRIEVANCE_ESCALATED: 21,
  GRIEVANCE_CLOSED: 22,
  SLA_UPDATED: 23,
  CATEGORY_CREATED: 24,
  CATEGORY_UPDATED: 25
};

const Priority = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    failed++;
    console.error(`  ❌ FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    passed++;
    console.log(`  ✅ PASSED: ${msg}`);
  }
}

async function runTests() {
  console.log("Starting Ganache provider...");
  const options = {
    wallet: {
      totalAccounts: 10,
      defaultBalance: 1000
    },
    logging: { quiet: true }
  };
  const provider = new ethers.BrowserProvider(ganache.provider(options));

  // Intercept eth_estimateGas on JSON-RPC to add 50% safety buffer for all contract transactions
  const origSend = provider.send.bind(provider);
  provider.send = async function(method, params) {
    const res = await origSend(method, params);
    if (method === "eth_estimateGas" && typeof res === "string" && res.startsWith("0x")) {
      const buffered = (BigInt(res) * 150n) / 100n;
      return "0x" + buffered.toString(16);
    }
    return res;
  };

  const signers = [];
  for (let i = 0; i < 10; i++) {
    signers.push(await provider.getSigner(i));
  }

  const [
    superAdmin,
    deptAdmin,
    officer1,
    officer2,
    citizen1,
    citizen2,
    stranger
  ] = signers;

  console.log("Accounts initialized.");
  console.log("SuperAdmin:", await superAdmin.getAddress());
  console.log("DeptAdmin: ", await deptAdmin.getAddress());
  console.log("Officer1:  ", await officer1.getAddress());
  console.log("Citizen1:  ", await citizen1.getAddress());

  console.log("\n=========================================");
  console.log("1. DEPLOYMENT & AUDIT WRITER SETUP");
  console.log("=========================================");

  // 1. Deploy RoleManager
  const RoleManagerFactory = new ethers.ContractFactory(
    RoleManagerArtifact.abi,
    RoleManagerArtifact.bytecode,
    superAdmin
  );
  const roleManager = await RoleManagerFactory.deploy();
  await roleManager.waitForDeployment();
  const roleManagerAddr = await roleManager.getAddress();
  console.log("RoleManager deployed at:", roleManagerAddr);

  // 2. Deploy DepartmentManager
  const DeptManagerFactory = new ethers.ContractFactory(
    DepartmentManagerArtifact.abi,
    DepartmentManagerArtifact.bytecode,
    superAdmin
  );
  const deptManager = await DeptManagerFactory.deploy(roleManagerAddr);
  await deptManager.waitForDeployment();
  const deptManagerAddr = await deptManager.getAddress();
  console.log("DepartmentManager deployed at:", deptManagerAddr);

  // 3. Deploy GrievanceSystem
  const GrievanceSystemFactory = new ethers.ContractFactory(
    GrievanceSystemArtifact.abi,
    GrievanceSystemArtifact.bytecode,
    superAdmin
  );
  const grievanceSystem = await GrievanceSystemFactory.deploy(roleManagerAddr, deptManagerAddr);
  await grievanceSystem.waitForDeployment();
  const grievanceSystemAddr = await grievanceSystem.getAddress();
  console.log("GrievanceSystem deployed at:", grievanceSystemAddr);

  // 4. Deploy EscalationManager
  const EscalationFactory = new ethers.ContractFactory(
    EscalationManagerArtifact.abi,
    EscalationManagerArtifact.bytecode,
    superAdmin
  );
  const escalationManager = await EscalationFactory.deploy(
    roleManagerAddr,
    deptManagerAddr,
    grievanceSystemAddr
  );
  await escalationManager.waitForDeployment();
  const escalationManagerAddr = await escalationManager.getAddress();
  console.log("EscalationManager deployed at:", escalationManagerAddr);

  // Set EscalationManager in GrievanceSystem
  await (await grievanceSystem.connect(superAdmin).setEscalationManager(escalationManagerAddr)).wait();

  // 5. Deploy AuditTrail
  const AuditTrailFactory = new ethers.ContractFactory(
    AuditTrailArtifact.abi,
    AuditTrailArtifact.bytecode,
    superAdmin
  );
  const auditTrail = await AuditTrailFactory.deploy(roleManagerAddr);
  await auditTrail.waitForDeployment();
  const auditTrailAddr = await auditTrail.getAddress();
  console.log("AuditTrail deployed at:", auditTrailAddr);

  // Authorize business contracts as AUDIT_WRITER
  console.log("\nAuthorizing business contracts as AUDIT_WRITER in AuditTrail...");
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(roleManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(deptManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(grievanceSystemAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(escalationManagerAddr, true)).wait();

  assert(await auditTrail.isAuthorizedWriter(roleManagerAddr), "RoleManager is authorized writer");
  assert(await auditTrail.isAuthorizedWriter(deptManagerAddr), "DepartmentManager is authorized writer");
  assert(await auditTrail.isAuthorizedWriter(grievanceSystemAddr), "GrievanceSystem is authorized writer");
  assert(await auditTrail.isAuthorizedWriter(escalationManagerAddr), "EscalationManager is authorized writer");

  // Wire setAuditTrail in business contracts
  console.log("\nConnecting AuditTrail address to business contracts...");
  await (await roleManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await deptManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await grievanceSystem.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await escalationManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();

  assert((await roleManager.auditTrail()) === auditTrailAddr, "RoleManager auditTrail wired");
  assert((await deptManager.auditTrail()) === auditTrailAddr, "DepartmentManager auditTrail wired");
  assert((await grievanceSystem.auditTrail()) === auditTrailAddr, "GrievanceSystem auditTrail wired");
  assert((await escalationManager.auditTrail()) === auditTrailAddr, "EscalationManager auditTrail wired");

  console.log("\n=========================================");
  console.log("2. ROLE MANAGER AUDIT INTEGRATION");
  console.log("=========================================");

  // A. Grant Department Admin role
  const deptAdminAddr = await deptAdmin.getAddress();
  await (await roleManager.connect(superAdmin).grantDepartmentAdminRole(deptAdminAddr)).wait();

  let count = await auditTrail.getAuditCount();
  let record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.ROLE_GRANTED, "Audit action is ROLE_GRANTED");
  assert(record.actor === (await superAdmin.getAddress()), "Actor is SuperAdmin");
  assert(record.targetId === BigInt(deptAdminAddr), "TargetId is deptAdmin address");

  // B. Grant Officer role
  const officer1Addr = await officer1.getAddress();
  await (await roleManager.connect(superAdmin).grantOfficerRole(officer1Addr)).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.ROLE_GRANTED, "Audit action is ROLE_GRANTED for officer");
  assert(record.targetId === BigInt(officer1Addr), "TargetId is officer1 address");

  // C. Register Citizen
  const citizen1Addr = await citizen1.getAddress();
  await (await roleManager.connect(citizen1).registerCitizen()).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.USER_REGISTERED, "Audit action is USER_REGISTERED");
  assert(record.actor === citizen1Addr, "Actor is Citizen1");
  assert(record.targetId === BigInt(citizen1Addr), "TargetId is citizen1 address");

  // D. Role Revocation audit
  const officer2Addr = await officer2.getAddress();
  await (await roleManager.connect(superAdmin).grantOfficerRole(officer2Addr)).wait();
  await (await roleManager.connect(superAdmin).revokeOfficerRole(officer2Addr)).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.ROLE_REVOKED, "Audit action is ROLE_REVOKED");
  assert(record.targetId === BigInt(officer2Addr), "TargetId is officer2 address");

  console.log("\n=========================================");
  console.log("3. DEPARTMENT MANAGER AUDIT INTEGRATION");
  console.log("=========================================");

  // A. Create Department
  const createDeptTx = await deptManager.connect(superAdmin).createDepartment("Sanitation", deptAdminAddr);
  await createDeptTx.wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.DEPARTMENT_CREATED, "Audit action is DEPARTMENT_CREATED");
  assert(record.targetId === 1n, "TargetId is departmentId 1");
  assert(record.actor === (await superAdmin.getAddress()), "Actor is SuperAdmin");

  // B. Update Department
  await (await deptManager.connect(superAdmin).updateDepartment(1, "Public Sanitation")).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.DEPARTMENT_UPDATED, "Audit action is DEPARTMENT_UPDATED");
  assert(record.targetId === 1n, "TargetId is departmentId 1");

  // C. Add Officer to Department
  await (await deptManager.connect(deptAdmin).addOfficerToDepartment(1, officer1Addr)).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.OFFICER_ADDED, "Audit action is OFFICER_ADDED");
  assert(record.targetId === 1n, "TargetId is departmentId 1");
  assert(record.detailsHash === ethers.zeroPadValue(officer1Addr, 32), "detailsHash is padded officer address");

  // D. Remove Officer from Department (and re-add for subsequent tests)
  await (await deptManager.connect(deptAdmin).removeOfficerFromDepartment(1, officer1Addr)).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.OFFICER_REMOVED, "Audit action is OFFICER_REMOVED");
  await (await deptManager.connect(deptAdmin).addOfficerToDepartment(1, officer1Addr)).wait();

  // E. Create Category
  await (await deptManager.connect(superAdmin).createCategory("Garbage Collection", "Waste management issues")).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.CATEGORY_CREATED, "Audit action is CATEGORY_CREATED");
  assert(record.targetId === 1n, "TargetId is categoryId 1");

  // F. Update Category
  await (await deptManager.connect(superAdmin).updateCategory(1, "Solid Waste Collection", "Updated desc")).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.CATEGORY_UPDATED, "Audit action is CATEGORY_UPDATED");
  assert(record.targetId === 1n, "TargetId is categoryId 1");

  // G. Deactivate Department (test on Department 2)
  await (await deptManager.connect(superAdmin).createDepartment("Temporary Dept", deptAdminAddr)).wait();
  await (await deptManager.connect(superAdmin).deactivateDepartment(2)).wait();
  count = await auditTrail.getAuditCount();
  record = await auditTrail.getAuditEntry(count);
  assert(Number(record.action) === AuditAction.DEPARTMENT_DEACTIVATED, "Audit action is DEPARTMENT_DEACTIVATED");
  assert(record.targetId === 2n, "TargetId is departmentId 2");

  console.log("\n=========================================");
  console.log("4. GRIEVANCE SYSTEM LIFECYCLE AUDIT INTEGRATION");
  console.log("=========================================");

  // 0. Update SLA Duration (Super Admin updates HIGH priority duration)
  const newHighSla = 86400 * 5; // 5 days
  await (await grievanceSystem.connect(superAdmin).updateSlaDuration(Priority.HIGH, newHighSla)).wait();
  const slaAudits = await auditTrail.getAuditsByTarget(Priority.HIGH);
  const auditSla = await auditTrail.getAuditEntry(slaAudits[slaAudits.length - 1]);
  assert(Number(auditSla.action) === AuditAction.SLA_UPDATED, "Audit action is SLA_UPDATED");
  assert(auditSla.actor === (await superAdmin.getAddress()), "Actor is SuperAdmin");
  assert(auditSla.targetId === BigInt(Priority.HIGH), "TargetId is Priority tier (2)");
  assert(auditSla.detailsHash === ethers.zeroPadValue(ethers.toBeHex(newHighSla), 32), "detailsHash is newDuration bytes32");
  assert((await grievanceSystem.getSlaDuration(Priority.HIGH)) === BigInt(newHighSla), "getSlaDuration returns updated duration");

  // Non-SuperAdmin cannot update SLA
  let nonAdminSlaFailed = false;
  try {
    await grievanceSystem.connect(citizen1).updateSlaDuration(Priority.HIGH, 86400 * 2);
  } catch (err) {
    nonAdminSlaFailed = true;
  }
  assert(nonAdminSlaFailed, "Non-SuperAdmin cannot update SLA duration");

  // A. Create Grievance
  const title = "Overflowing dumpster";
  const descCid = "QmTestEvidenceHash12345678901234567890";
  const descHash = ethers.keccak256(ethers.toUtf8Bytes("Main street corner dumpster overflowing"));
  const createTx = await grievanceSystem.connect(citizen1).createGrievance(
    1, // categoryId
    1, // departmentId
    Priority.MEDIUM,
    title,
    descCid,
    descHash
  );
  await createTx.wait();

  // Grievance creation triggers GRIEVANCE_CREATED
  const g1Audits1 = await auditTrail.getAuditsByTarget(1);
  assert(g1Audits1.length >= 1, "Grievance 1 has at least 1 audit entry");
  const auditCreated = await auditTrail.getAuditEntry(g1Audits1[g1Audits1.length - 1]);
  assert(Number(auditCreated.action) === AuditAction.GRIEVANCE_CREATED, "Latest audit on target 1 is GRIEVANCE_CREATED");
  assert(auditCreated.actor === citizen1Addr, "Actor is Citizen1");
  assert(auditCreated.targetId === 1n, "TargetId is grievanceId 1");
  assert(auditCreated.detailsHash === descHash, "detailsHash is descriptionHash");

  // B. Register Grievance
  await (await grievanceSystem.connect(deptAdmin).registerGrievance(1)).wait();
  const g1Audits2 = await auditTrail.getAuditsByTarget(1);
  const auditReg = await auditTrail.getAuditEntry(g1Audits2[g1Audits2.length - 1]);
  assert(Number(auditReg.action) === AuditAction.GRIEVANCE_REGISTERED, "Audit action is GRIEVANCE_REGISTERED");
  assert(auditReg.actor === deptAdminAddr, "Actor is DeptAdmin");

  // C. Assign Grievance to Officer
  await (await grievanceSystem.connect(deptAdmin).assignOfficer(1, officer1Addr)).wait();
  const g1AfterAssign = await auditTrail.getAuditsByTarget(1);
  const auditAssign = await auditTrail.getAuditEntry(g1AfterAssign[g1AfterAssign.length - 1]);
  assert(Number(auditAssign.action) === AuditAction.GRIEVANCE_ASSIGNED, "Audit action is GRIEVANCE_ASSIGNED");
  assert(auditAssign.actor === deptAdminAddr, "Actor is DeptAdmin");
  assert(auditAssign.detailsHash === ethers.zeroPadValue(officer1Addr, 32), "detailsHash is padded officer address");

  // C2. Reassign Grievance to Officer 2, then back to Officer 1
  await (await roleManager.connect(superAdmin).grantOfficerRole(officer2Addr)).wait();
  await (await deptManager.connect(deptAdmin).addOfficerToDepartment(1, officer2Addr)).wait();

  await (await grievanceSystem.connect(deptAdmin).reassignOfficer(1, officer2Addr)).wait();
  const g1AfterReassign = await auditTrail.getAuditsByTarget(1);
  const auditReassign = await auditTrail.getAuditEntry(g1AfterReassign[g1AfterReassign.length - 1]);
  assert(Number(auditReassign.action) === AuditAction.GRIEVANCE_REASSIGNED, "Audit action is GRIEVANCE_REASSIGNED");
  assert(auditReassign.actor === deptAdminAddr, "Actor is DeptAdmin");
  assert(auditReassign.targetId === 1n, "TargetId is grievanceId 1");
  assert(auditReassign.detailsHash === ethers.zeroPadValue(officer2Addr, 32), "detailsHash is padded new officer address");
  assert((await grievanceSystem.getGrievance(1)).assignedOfficer === officer2Addr, "Assigned officer is now officer2");

  // Cannot reassign to same officer
  let reassignSameFailed = false;
  try {
    await grievanceSystem.connect(deptAdmin).reassignOfficer(1, officer2Addr);
  } catch (err) {
    reassignSameFailed = true;
  }
  assert(reassignSameFailed, "reassignOfficer to same officer reverts with CannotReassignToSameOfficer");

  // Reassign back to officer1 for subsequent investigation tests
  await (await grievanceSystem.connect(deptAdmin).reassignOfficer(1, officer1Addr)).wait();
  assert((await grievanceSystem.getGrievance(1)).assignedOfficer === officer1Addr, "Assigned officer restored to officer1");

  // D. Start Review then Investigation
  await (await grievanceSystem.connect(officer1).startReview(1)).wait();
  await (await grievanceSystem.connect(officer1).startInvestigation(1)).wait();
  const g1AfterStart = await auditTrail.getAuditsByTarget(1);
  const auditStart = await auditTrail.getAuditEntry(g1AfterStart[g1AfterStart.length - 1]);
  assert(Number(auditStart.action) === AuditAction.INVESTIGATION_STARTED, "Audit action is INVESTIGATION_STARTED");
  assert(auditStart.actor === officer1Addr, "Actor is Officer1");

  // E. Add Investigation Note
  const noteHash = ethers.keccak256(ethers.toUtf8Bytes("Inspected site, requested sanitation truck"));
  await (await grievanceSystem.connect(officer1).addInvestigationNote(1, "QmNoteCid123", noteHash)).wait();
  const g1AfterNote = await auditTrail.getAuditsByTarget(1);
  const auditNote = await auditTrail.getAuditEntry(g1AfterNote[g1AfterNote.length - 1]);
  assert(Number(auditNote.action) === AuditAction.INVESTIGATION_NOTE_ADDED, "Audit action is INVESTIGATION_NOTE_ADDED");
  assert(auditNote.detailsHash === noteHash, "detailsHash matches note hash");

  // F. Add Additional Evidence (EvidenceType 1 = RESOLUTION_PROOF)
  const newEvidenceIpfs = "QmEvidenceResolutionPhotoHash1234567890";
  const newEvidenceHash = ethers.keccak256(ethers.toUtf8Bytes("proof photo"));
  await (await grievanceSystem.connect(officer1).addEvidence(1, 1, newEvidenceIpfs, newEvidenceHash)).wait();
  const g1AfterEvidence = await auditTrail.getAuditsByTarget(1);
  const auditEvidence2 = await auditTrail.getAuditEntry(g1AfterEvidence[g1AfterEvidence.length - 1]);
  assert(Number(auditEvidence2.action) === AuditAction.EVIDENCE_ADDED, "Audit action is EVIDENCE_ADDED");
  assert(auditEvidence2.actor === officer1Addr, "Actor is Officer1");

  // G. Submit Resolution
  const resIpfs = "QmResolutionReportFullDocumentation123456789";
  const resHash = ethers.keccak256(ethers.toUtf8Bytes("complete resolution report"));
  await (await grievanceSystem.connect(officer1).submitResolution(1, resIpfs, resHash)).wait();
  const g1AfterRes = await auditTrail.getAuditsByTarget(1);
  const auditRes = await auditTrail.getAuditEntry(g1AfterRes[g1AfterRes.length - 1]);
  assert(Number(auditRes.action) === AuditAction.RESOLUTION_SUBMITTED, "Audit action is RESOLUTION_SUBMITTED");
  assert(auditRes.actor === officer1Addr, "Actor is Officer1");

  // H. Accept Resolution (Citizen)
  await (await grievanceSystem.connect(citizen1).acceptResolution(1)).wait();
  const g1AfterAccept = await auditTrail.getAuditsByTarget(1);
  const auditAccept = await auditTrail.getAuditEntry(g1AfterAccept[g1AfterAccept.length - 1]);
  assert(Number(auditAccept.action) === AuditAction.RESOLUTION_ACCEPTED, "Audit action is RESOLUTION_ACCEPTED");
  assert(auditAccept.actor === citizen1Addr, "Actor is Citizen1");

  // I. Close Grievance (Citizen)
  await (await grievanceSystem.connect(citizen1).closeGrievance(1)).wait();
  const g1AfterClose = await auditTrail.getAuditsByTarget(1);
  const auditClosed = await auditTrail.getAuditEntry(g1AfterClose[g1AfterClose.length - 1]);
  assert(Number(auditClosed.action) === AuditAction.GRIEVANCE_CLOSED, "Audit action is GRIEVANCE_CLOSED");

  // J. Lifecycle test: Rejection and Reopening on Grievance 2
  console.log("\nTesting Rejection and Reopening on Grievance 2...");
  const descHash2 = ethers.keccak256(ethers.toUtf8Bytes("Pothole on 5th avenue"));
  await (await grievanceSystem.connect(citizen1).createGrievance(1, 1, Priority.HIGH, "Pothole", "QmPotholeCid", descHash2)).wait();
  await (await grievanceSystem.connect(deptAdmin).registerGrievance(2)).wait();
  await (await grievanceSystem.connect(deptAdmin).assignOfficer(2, officer1Addr)).wait();
  await (await grievanceSystem.connect(officer1).startReview(2)).wait();
  await (await grievanceSystem.connect(officer1).startInvestigation(2)).wait();
  const resHash2 = ethers.keccak256(ethers.toUtf8Bytes("QmPotholeTemporaryPatch"));
  await (await grievanceSystem.connect(officer1).submitResolution(2, "QmPotholeTemporaryPatch", resHash2)).wait();

  // Citizen rejects resolution
  const rejectReasonHash = ethers.keccak256(ethers.toUtf8Bytes("Pothole was poorly filled with gravel only"));
  await (await grievanceSystem.connect(citizen1).rejectResolution(2, rejectReasonHash)).wait();
  const g2AuditsReject = await auditTrail.getAuditsByTarget(2);
  const auditReject = await auditTrail.getAuditEntry(g2AuditsReject[g2AuditsReject.length - 1]);
  assert(Number(auditReject.action) === AuditAction.RESOLUTION_REJECTED, "Audit action is RESOLUTION_REJECTED");
  assert(auditReject.actor === citizen1Addr, "Actor is Citizen1");
  assert(auditReject.detailsHash === rejectReasonHash, "detailsHash matches rejectReasonHash");

  // Citizen reopens grievance
  await (await grievanceSystem.connect(citizen1).reopenGrievance(2)).wait();
  const g2AuditsReopen = await auditTrail.getAuditsByTarget(2);
  const auditReopen = await auditTrail.getAuditEntry(g2AuditsReopen[g2AuditsReopen.length - 1]);
  assert(Number(auditReopen.action) === AuditAction.GRIEVANCE_REOPENED, "Audit action is GRIEVANCE_REOPENED");
  assert(auditReopen.actor === citizen1Addr, "Actor is Citizen1");

  console.log("\n=========================================");
  console.log("5. ESCALATION MANAGER AUDIT INTEGRATION");
  console.log("=========================================");

  // Create Grievance 3 and test escalation
  const descHash3 = ethers.keccak256(ethers.toUtf8Bytes("Broken water main"));
  await (await grievanceSystem.connect(citizen1).createGrievance(1, 1, Priority.CRITICAL, "Water Leak", "QmWaterLeak", descHash3)).wait();
  await (await grievanceSystem.connect(deptAdmin).registerGrievance(3)).wait();
  await (await grievanceSystem.connect(deptAdmin).assignOfficer(3, officer1Addr)).wait();
  await (await grievanceSystem.connect(officer1).startReview(3)).wait();
  await (await grievanceSystem.connect(officer1).startInvestigation(3)).wait();

  // Advance time past SLA deadline and mine a block so the new timestamp is committed
  await provider.send("evm_increaseTime", [86400 * 30]);
  const dummyTx = await superAdmin.sendTransaction({ to: await superAdmin.getAddress(), value: 0 });
  await dummyTx.wait();

  const exists3 = await grievanceSystem.grievanceExists(3);
  console.log("grievanceExists(3):", exists3);
  const g3 = await grievanceSystem.getGrievance(3);
  console.log("Grievance 3 status:", g3.status, "deadline:", g3.slaDeadline, "deptId:", g3.departmentId);
  console.log("Latest block timestamp:", (await provider.getBlock("latest")).timestamp);
  console.log("Dept 1 active?", await deptManager.isDepartmentActive(g3.departmentId));
  console.log("isSLABreached(3):", await escalationManager.isSLABreached(3));
  console.log("canEscalate(3):", await escalationManager.canEscalate(3));

  // SuperAdmin manual escalation
  await (await escalationManager.connect(superAdmin).escalateGrievance(3)).wait();
  const g3Audits = await auditTrail.getAuditsByTarget(3);
  const auditEsc = await auditTrail.getAuditEntry(g3Audits[g3Audits.length - 1]);
  assert(Number(auditEsc.action) === AuditAction.GRIEVANCE_ESCALATED, "Audit action is GRIEVANCE_ESCALATED");
  assert(auditEsc.actor === (await superAdmin.getAddress()), "Actor is SuperAdmin");
  assert(auditEsc.targetId === 3n, "TargetId is grievanceId 3");

  // Resolve escalation back to investigation
  await (await escalationManager.connect(superAdmin).resolveEscalation(3)).wait();
  const g3AuditsAfterResolve = await auditTrail.getAuditsByTarget(3);
  const auditResolve = await auditTrail.getAuditEntry(g3AuditsAfterResolve[g3AuditsAfterResolve.length - 1]);
  assert(Number(auditResolve.action) === AuditAction.STATUS_CHANGED, "Audit action is STATUS_CHANGED");

  console.log("\n=========================================");
  console.log("6. AUDIT TRAIL SECURITY & ATOMICITY TESTS");
  console.log("=========================================");

  // A. Unauthorized caller cannot record audit
  let directCallFailed = false;
  try {
    await auditTrail.connect(stranger).recordAudit(AuditAction.GRIEVANCE_CREATED, await stranger.getAddress(), 99, ethers.ZeroHash);
  } catch (err) {
    directCallFailed = true;
  }
  assert(directCallFailed, "Unauthorized stranger cannot call recordAudit directly");

  // B. Revoking writer authorization causes calling contract transaction to fail (Atomicity)
  console.log("Testing atomicity: revoking GrievanceSystem AUDIT_WRITER role...");
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(grievanceSystemAddr, false)).wait();
  assert(!(await auditTrail.isAuthorizedWriter(grievanceSystemAddr)), "GrievanceSystem writer authorization revoked");

  let txReverted = false;
  try {
    const failHash = ethers.keccak256(ethers.toUtf8Bytes("fail"));
    await grievanceSystem.connect(citizen1).createGrievance(1, 1, Priority.LOW, "Will fail", "QmFail", failHash);
  } catch (err) {
    txReverted = true;
  }
  assert(txReverted, "Transaction reverts atomically when AuditTrail call fails");

  let slaTxReverted = false;
  try {
    await grievanceSystem.connect(superAdmin).updateSlaDuration(Priority.LOW, 99999);
  } catch (err) {
    slaTxReverted = true;
  }
  assert(slaTxReverted, "updateSlaDuration reverts atomically when AuditTrail call fails");

  // Re-authorize GrievanceSystem
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(grievanceSystemAddr, true)).wait();

  // C. Setting zero address reverts
  let zeroAddrReverted = false;
  try {
    await grievanceSystem.connect(superAdmin).setAuditTrail(ethers.ZeroAddress);
  } catch (err) {
    zeroAddrReverted = true;
  }
  assert(zeroAddrReverted, "setAuditTrail(address(0)) reverts with ZeroAddressNotAllowed");

  console.log("\n=========================================");
  console.log("7. AUDIT TRAIL VERIFICATION & QUERY TESTS");
  console.log("=========================================");

  const totalAuditRecords = await auditTrail.getAuditCount();
  console.log("Total audit records created:", totalAuditRecords.toString());
  assert(totalAuditRecords > 15n, "Substantial number of audit records exist");

  // Verify auditExists
  assert(await auditTrail.auditExists(1), "Audit entry 1 exists");
  assert(await auditTrail.auditExists(totalAuditRecords), "Latest audit entry exists");
  assert(!(await auditTrail.auditExists(totalAuditRecords + 1n)), "Non-existent audit entry returns false");

  // Verify pagination range getAuditEntries(1, 5)
  const entriesPage = await auditTrail.getAuditEntries(1, 5);
  assert(entriesPage.length === 5, "getAuditEntries(1, 5) returns exactly 5 records");
  assert(entriesPage[0].id === 1n, "First page entry has id 1");
  assert(entriesPage[4].id === 5n, "Fifth page entry has id 5");

  // Test actor query
  const citizen1Audits = await auditTrail.getAuditsByActor(citizen1Addr);
  assert(citizen1Audits.length > 0, "Citizen1 has indexed audit records");

  // Test target query
  const dept1Audits = await auditTrail.getAuditsByTarget(1);
  assert(dept1Audits.length > 0, "Target ID 1 has indexed audit records");

  // Verify single entry retrieval
  const entry1 = await auditTrail.getAuditEntry(1);
  assert(entry1.id === 1n, "Entry 1 id matches");
  assert(entry1.actor !== ethers.ZeroAddress, "Entry 1 has non-zero actor");
  assert(entry1.timestamp > 0n, "Entry 1 has valid timestamp");

  // Verify out-of-range reverts
  let entryNotFoundReverted = false;
  try {
    await auditTrail.getAuditEntry(99999);
  } catch (err) {
    entryNotFoundReverted = true;
  }
  assert(entryNotFoundReverted, "getAuditEntry(99999) reverts with AuditEntryNotFound");

  let zeroStartIdReverted = false;
  try {
    await auditTrail.getAuditEntries(0, 5);
  } catch (err) {
    zeroStartIdReverted = true;
  }
  assert(zeroStartIdReverted, "getAuditEntries(0, 5) reverts with ValueOutOfRange");

  console.log("\n=========================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
