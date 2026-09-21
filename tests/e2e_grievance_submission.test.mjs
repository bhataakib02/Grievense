/**
 * e2e_grievance_submission.test.mjs
 *
 * End-to-End Service Verification Test for Step 11C:
 * Real Blockchain Grievance Submission & Transaction Verification.
 *
 * Verifies:
 * 1. Full contract suite deployment & wiring on Ganache (Chain ID 1337).
 * 2. Real citizen registration via RoleManager.
 * 3. Department and Category retrieval via fetchActiveDepartments & fetchActiveCategories.
 * 4. Deterministic IPFS canonical payload generation, CIDv1 computation, and keccak256 commitment.
 * 5. Phase 1: sendGrievanceTransaction() broadcast & pending tx hash extraction.
 * 6. Phase 2: waitForGrievanceConfirmation() block mining & GrievanceCreated event decoding.
 * 7. On-chain getGrievance() returning all 15 fields matching submitted data.
 * 8. On-chain AuditTrail recording GRIEVANCE_CREATED (action 8) with citizen actor and detailsHash.
 * 9. verifyAuditRecord() service function on-chain cryptographic proof validation.
 * 10. fetchCitizenGrievances() and fetchGrievanceDetails() service integration.
 * 11. Security & authorization negative tests (unregistered citizen revert, invalid department/category revert).
 * 12. Backward compatibility of submitGrievance() wrapper.
 */

import { ethers } from 'ethers';
import ganache from 'ganache';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  setContractAddress,
  CONTRACT_ADDRESSES,
  isContractConfigured,
} from '../frontend/src/contracts/addresses.js';

import {
  PRIORITIES,
  STATUSES,
  fetchActiveDepartments,
  fetchActiveCategories,
  sendGrievanceTransaction,
  waitForGrievanceConfirmation,
  submitGrievance,
  fetchGrievanceDetails,
  fetchCitizenGrievances,
  verifyAuditRecord,
} from '../frontend/src/services/grievanceService.js';

import {
  createCanonicalDescriptionPayload,
  computeContentHash,
  computeIpfsCidV1,
} from '../frontend/src/services/ipfs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadArtifact(name) {
  const p = path.join(__dirname, '..', 'build', `${name}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`Artifact ${name}.json not found. Run 'node scripts/compile.js' first.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✅ PASSED: ${message}`);
  }
}

async function runE2ETest() {
  console.log('================================================================');
  console.log('STEP 11C — REAL BLOCKCHAIN GRIEVANCE SUBMISSION E2E TEST');
  console.log('================================================================\n');

  // 1. Start Ganache HTTP Server
  console.log('[1/7] Initializing Ganache server (Chain ID: 1337)...');
  const testPort = 8546;
  const options = {
    wallet: {
      totalAccounts: 10,
      defaultBalance: 1000,
      mnemonic: 'myth like bonus scare over problem client lizard pioneer submit female collect',
    },
    chain: {
      chainId: 1337,
      networkId: 1337,
    },
    logging: { quiet: true },
  };

  const ganacheServer = ganache.server(options);
  await new Promise((resolve, reject) => {
    ganacheServer.listen(testPort, (err) => (err ? reject(err) : resolve()));
  });

  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${testPort}`);

  // Buffer gas estimates by 50%
  const origSend = provider.send.bind(provider);
  provider.send = async function (method, params) {
    const res = await origSend(method, params);
    if (method === 'eth_estimateGas' && typeof res === 'string' && res.startsWith('0x')) {
      const buffered = (BigInt(res) * 150n) / 100n;
      return '0x' + buffered.toString(16);
    }
    return res;
  };

  const superAdmin = await provider.getSigner(0);
  const deptAdmin = await provider.getSigner(1);
  const officer1 = await provider.getSigner(2);
  const citizen1 = await provider.getSigner(3);
  const citizen2 = await provider.getSigner(4);
  const stranger = await provider.getSigner(5);

  const citizen1Addr = await citizen1.getAddress();
  const strangerAddr = await stranger.getAddress();

  console.log(`  Deployer (SuperAdmin): ${await superAdmin.getAddress()}`);
  console.log(`  Citizen 1:            ${citizen1Addr}`);
  console.log(`  Stranger:             ${strangerAddr}\n`);

  // 2. Deploy Full Contract Suite
  console.log('[2/7] Deploying Smart Contracts...');
  const RoleManagerArtifact = loadArtifact('RoleManager');
  const DepartmentManagerArtifact = loadArtifact('DepartmentManager');
  const GrievanceSystemArtifact = loadArtifact('GrievanceSystem');
  const EscalationManagerArtifact = loadArtifact('EscalationManager');
  const AuditTrailArtifact = loadArtifact('AuditTrail');

  const roleManager = await (
    new ethers.ContractFactory(RoleManagerArtifact.abi, RoleManagerArtifact.bytecode, superAdmin)
  ).deploy();
  await roleManager.waitForDeployment();
  const roleManagerAddr = await roleManager.getAddress();

  const deptManager = await (
    new ethers.ContractFactory(DepartmentManagerArtifact.abi, DepartmentManagerArtifact.bytecode, superAdmin)
  ).deploy(roleManagerAddr);
  await deptManager.waitForDeployment();
  const deptManagerAddr = await deptManager.getAddress();

  const grievanceSystem = await (
    new ethers.ContractFactory(GrievanceSystemArtifact.abi, GrievanceSystemArtifact.bytecode, superAdmin)
  ).deploy(roleManagerAddr, deptManagerAddr);
  await grievanceSystem.waitForDeployment();
  const grievanceSystemAddr = await grievanceSystem.getAddress();

  const escalationManager = await (
    new ethers.ContractFactory(EscalationManagerArtifact.abi, EscalationManagerArtifact.bytecode, superAdmin)
  ).deploy(roleManagerAddr, deptManagerAddr, grievanceSystemAddr);
  await escalationManager.waitForDeployment();
  const escalationManagerAddr = await escalationManager.getAddress();

  await (await grievanceSystem.connect(superAdmin).setEscalationManager(escalationManagerAddr)).wait();

  const auditTrail = await (
    new ethers.ContractFactory(AuditTrailArtifact.abi, AuditTrailArtifact.bytecode, superAdmin)
  ).deploy(roleManagerAddr);
  await auditTrail.waitForDeployment();
  const auditTrailAddr = await auditTrail.getAddress();

  // Authorize business contracts as AUDIT_WRITER
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(roleManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(deptManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(grievanceSystemAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(escalationManagerAddr, true)).wait();

  // Wire setAuditTrail in business contracts
  await (await roleManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await deptManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await grievanceSystem.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await escalationManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();

  console.log('  Contracts deployed and AuditTrail authorized.\n');

  // 3. Configure Frontend Service Addresses in Memory
  setContractAddress('RoleManager', roleManagerAddr);
  setContractAddress('DepartmentManager', deptManagerAddr);
  setContractAddress('GrievanceSystem', grievanceSystemAddr);
  setContractAddress('EscalationManager', escalationManagerAddr);
  setContractAddress('AuditTrail', auditTrailAddr);

  assert(isContractConfigured('GrievanceSystem'), 'GrievanceSystem address configured in frontend service');
  assert(isContractConfigured('AuditTrail'), 'AuditTrail address configured in frontend service');

  // 4. Seed Initial Roles & Data
  console.log('\n[3/7] Seeding Roles, Departments, Categories, and Citizen Registration...');
  await (await roleManager.connect(superAdmin).grantDepartmentAdminRole(await deptAdmin.getAddress())).wait();
  await (await deptManager.connect(superAdmin).createDepartment('Public Works & Roads', await deptAdmin.getAddress())).wait();
  await (await deptManager.connect(superAdmin).createCategory('Potholes & Pavement Defect', 'Pavement cracks, potholes, street surface issues')).wait();

  // Register citizen1 in RoleManager
  await (await roleManager.connect(citizen1).registerCitizen()).wait();
  assert(await roleManager.isCitizen(citizen1Addr), 'Citizen 1 registered in RoleManager');
  assert(!(await roleManager.isCitizen(strangerAddr)), 'Stranger is NOT registered in RoleManager');

  // Verify frontend service read functions work against real contracts
  const activeDepts = await fetchActiveDepartments(provider);
  assert(activeDepts.length === 1 && activeDepts[0].name === 'Public Works & Roads', 'fetchActiveDepartments returns real department');

  const activeCats = await fetchActiveCategories(provider);
  assert(activeCats.length === 1 && activeCats[0].name === 'Potholes & Pavement Defect', 'fetchActiveCategories returns real category');

  // 5. Test Two-Phase Submission Flow
  console.log('\n[4/7] Testing Two-Phase Citizen Grievance Submission Flow...');

  const grievanceTitle = 'Dangerous Pothole on 5th Avenue';
  const grievanceDesc = 'Deep pothole causing vehicle damage near the central transit station.';
  const payloadTimestamp = Math.floor(Date.now() / 1000);

  const canonicalPayload = createCanonicalDescriptionPayload({
    title: grievanceTitle,
    description: grievanceDesc,
    departmentId: 1,
    categoryId: 1,
    priority: PRIORITIES.HIGH,
    timestamp: payloadTimestamp,
  });

  const descriptionHash = computeContentHash(canonicalPayload);
  const payloadBytes = Buffer.from(canonicalPayload, 'utf8');
  const descriptionCid = computeIpfsCidV1(payloadBytes);

  console.log(`  Canonical Payload: ${canonicalPayload}`);
  console.log(`  Computed CIDv1:    ${descriptionCid}`);
  console.log(`  Keccak-256 Hash:   ${descriptionHash}`);

  assert(descriptionCid.startsWith('bafkrei'), 'CIDv1 uses authentic base32 raw multihash format');
  assert(descriptionHash.startsWith('0x') && descriptionHash.length === 66, 'Keccak-256 hash is bytes32 format');

  // Phase 1: sendGrievanceTransaction (simulates MetaMask signature & mempool broadcast)
  console.log('\n  --> Executing Phase 1: sendGrievanceTransaction()...');
  const { tx, grievanceContract } = await sendGrievanceTransaction(citizen1, {
    categoryId: 1,
    departmentId: 1,
    priority: PRIORITIES.HIGH,
    title: grievanceTitle,
    descriptionCid,
    descriptionHash,
  });

  assert(Boolean(tx.hash && tx.hash.startsWith('0x')), `Phase 1 returns pending tx with valid hash: ${tx.hash}`);

  // Phase 2: waitForGrievanceConfirmation (simulates block mining & receipt processing)
  console.log('  --> Executing Phase 2: waitForGrievanceConfirmation()...');
  const confirmation = await waitForGrievanceConfirmation(tx, grievanceContract);

  assert(confirmation.grievanceId === 1, `Decoded GrievanceCreated event: Grievance ID is ${confirmation.grievanceId}`);
  assert(confirmation.txHash === tx.hash, 'Confirmation txHash matches broadcast transaction');
  assert(confirmation.blockNumber > 0, `Confirmed in real block number #${confirmation.blockNumber}`);
  assert(confirmation.receipt.status === 1, 'Transaction receipt status is 1 (SUCCESS)');

  // 6. Verify 15 On-Chain Fields and Details Retrieval
  console.log('\n[5/7] Verifying 15 Smart Contract Grievance Fields via fetchGrievanceDetails()...');
  const details = await fetchGrievanceDetails(provider, 1);

  assert(details.id === 1, 'Field 1 (id): matches 1');
  assert(details.citizen.toLowerCase() === citizen1Addr.toLowerCase(), 'Field 2 (citizen): matches Citizen1');
  assert(details.status === STATUSES.SUBMITTED, 'Field 3 (status): matches SUBMITTED (0)');
  assert(details.priority === PRIORITIES.HIGH, 'Field 4 (priority): matches HIGH (2)');
  assert(details.reopenCount === 0, 'Field 5 (reopenCount): matches 0');
  assert(details.assignedOfficer === ethers.ZeroAddress, 'Field 6 (assignedOfficer): matches ZeroAddress');
  assert(details.departmentId === 1, 'Field 7 (departmentId): matches 1');
  assert(details.categoryId === 1, 'Field 8 (categoryId): matches 1');
  assert(details.title === grievanceTitle, 'Field 9 (title): matches submitted title');
  assert(details.descriptionCid === descriptionCid, 'Field 10 (descriptionCid): matches authentic CIDv1');
  assert(details.descriptionHash === descriptionHash, 'Field 11 (descriptionHash): matches keccak256 hash');
  assert(details.createdAt > 0, `Field 12 (createdAt): valid on-chain timestamp ${details.createdAt}`);
  assert(details.updatedAt === details.createdAt, 'Field 13 (updatedAt): equals createdAt initially');
  assert(details.slaDeadline > 0, `Field 14 (slaDeadline): valid deadline timestamp ${details.slaDeadline}`);
  assert(details.currentResolutionId === 0, 'Field 15 (currentResolutionId): 0 initially');

  // 7. Verify On-Chain AuditTrail Entry & verifyAuditRecord() Proof
  console.log('\n[6/7] Verifying AuditTrail On-Chain Integrity Proof...');
  const auditVerification = await verifyAuditRecord(provider, 1, citizen1Addr, descriptionHash);
  assert(auditVerification.isVerified, 'verifyAuditRecord returns isVerified: true');
  assert(auditVerification.action === 'GRIEVANCE_CREATED', `Audit action is GRIEVANCE_CREATED (${auditVerification.action})`);
  assert(auditVerification.auditId > 0, `Audit entry exists at auditId #${auditVerification.auditId}`);

  // Raw contract check on AuditTrail
  const rawAuditCount = await auditTrail.getAuditCount();
  const rawAudit = await auditTrail.getAuditEntry(rawAuditCount);
  assert(Number(rawAudit.action) === 8, 'Raw AuditTrail action code is 8 (GRIEVANCE_CREATED)');
  assert(rawAudit.actor.toLowerCase() === citizen1Addr.toLowerCase(), 'Raw AuditTrail actor is Citizen1');
  assert(rawAudit.targetId === 1n, 'Raw AuditTrail targetId is Grievance ID 1');
  assert(rawAudit.detailsHash === descriptionHash, 'Raw AuditTrail detailsHash matches committed descriptionHash');

  // Verify Citizen Grievances Indexing
  const citizenList = await fetchCitizenGrievances(provider, citizen1Addr);
  assert(citizenList.length === 1 && citizenList[0].id === 1, 'fetchCitizenGrievances lists newly created grievance');

  // 8. Negative & Edge Case Tests
  console.log('\n[7/7] Verifying Security Guards, Authorization & Reverts...');

  // A. Unregistered citizen cannot submit
  let strangerFailed = false;
  try {
    await sendGrievanceTransaction(stranger, {
      categoryId: 1,
      departmentId: 1,
      priority: PRIORITIES.MEDIUM,
      title: 'Unauthorized grievance',
      descriptionCid,
      descriptionHash,
    });
  } catch (err) {
    strangerFailed = true;
    console.log(`  Expected revert on unregistered citizen: ${err.message.slice(0, 80)}...`);
  }
  assert(strangerFailed, 'Unregistered citizen submission correctly reverted by contract');

  // B. Inactive / non-existent department rejected
  let invalidDeptFailed = false;
  try {
    await sendGrievanceTransaction(citizen1, {
      categoryId: 1,
      departmentId: 999, // Non-existent
      priority: PRIORITIES.MEDIUM,
      title: 'Invalid department',
      descriptionCid,
      descriptionHash,
    });
  } catch (err) {
    invalidDeptFailed = true;
  }
  assert(invalidDeptFailed, 'Non-existent department ID correctly reverted by contract');

  // C. Inactive / non-existent category rejected
  let invalidCatFailed = false;
  try {
    await sendGrievanceTransaction(citizen1, {
      categoryId: 999, // Non-existent
      departmentId: 1,
      priority: PRIORITIES.MEDIUM,
      title: 'Invalid category',
      descriptionCid,
      descriptionHash,
    });
  } catch (err) {
    invalidCatFailed = true;
  }
  assert(invalidCatFailed, 'Non-existent category ID correctly reverted by contract');

  // D. Empty title rejected
  let emptyTitleFailed = false;
  try {
    await sendGrievanceTransaction(citizen1, {
      categoryId: 1,
      departmentId: 1,
      priority: PRIORITIES.MEDIUM,
      title: '',
      descriptionCid,
      descriptionHash,
    });
  } catch (err) {
    emptyTitleFailed = true;
  }
  assert(emptyTitleFailed, 'Empty title correctly reverted by contract');

  // E. Backward compatibility check: submitGrievance() wrapper
  console.log('\n  --> Testing backward compatibility of submitGrievance() convenience wrapper...');
  const wrapperResult = await submitGrievance(citizen1, {
    categoryId: 1,
    departmentId: 1,
    priority: PRIORITIES.LOW,
    title: 'Second Grievance via submitGrievance()',
    descriptionCid,
    descriptionHash,
  });
  assert(wrapperResult.grievanceId === 2, `submitGrievance wrapper assigned grievance ID #2`);
  assert(wrapperResult.receipt.status === 1, 'submitGrievance wrapper confirmed on-chain');

  console.log('\n================================================================');
  console.log(`ALL E2E VERIFICATION TESTS PASSED: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  await ganacheServer.close();
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('\n❌ E2E TEST RUNNER ERROR:', err);
  process.exit(1);
});
