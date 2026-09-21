import {
  getGrievanceSystemContract,
  getDepartmentManagerContract,
  getAuditTrailContract,
} from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';

/**
 * Exact Priority enum definitions matching GrievanceTypes.sol
 */
export const PRIORITIES = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const PRIORITY_METADATA = {
  [PRIORITIES.LOW]: {
    label: 'Low',
    description: 'Minor non-urgent issues (14-day SLA target)',
    slaDays: 14,
    badgeVariant: 'default',
  },
  [PRIORITIES.MEDIUM]: {
    label: 'Medium',
    description: 'Standard public service complaints (7-day SLA target)',
    slaDays: 7,
    badgeVariant: 'primary',
  },
  [PRIORITIES.HIGH]: {
    label: 'High',
    description: 'Urgent service disruption or health/safety hazard (3-day SLA target)',
    slaDays: 3,
    badgeVariant: 'warning',
  },
  [PRIORITIES.CRITICAL]: {
    label: 'Critical',
    description: 'Severe public emergencies requiring immediate response (24-hour SLA target)',
    slaDays: 1,
    badgeVariant: 'danger',
  },
};

/**
 * Exact Status enum definitions matching GrievanceTypes.sol
 */
export const STATUSES = {
  SUBMITTED: 0,
  REGISTERED: 1,
  ASSIGNED: 2,
  UNDER_REVIEW: 3,
  UNDER_INVESTIGATION: 4,
  RESOLUTION_PROPOSED: 5,
  CITIZEN_REVIEW: 6,
  ACCEPTED: 7,
  CLOSED: 8,
  REJECTED: 9,
  REOPENED: 10,
  ESCALATED: 11,
};

export const STATUS_METADATA = {
  [STATUSES.SUBMITTED]: { label: 'Submitted', badgeVariant: 'primary' },
  [STATUSES.REGISTERED]: { label: 'Registered', badgeVariant: 'neutral' },
  [STATUSES.ASSIGNED]: { label: 'Assigned', badgeVariant: 'warning' },
  [STATUSES.UNDER_REVIEW]: { label: 'Under Review', badgeVariant: 'warning' },
  [STATUSES.UNDER_INVESTIGATION]: { label: 'Under Investigation', badgeVariant: 'warning' },
  [STATUSES.RESOLUTION_PROPOSED]: { label: 'Resolution Proposed', badgeVariant: 'neutral' },
  [STATUSES.CITIZEN_REVIEW]: { label: 'Citizen Review', badgeVariant: 'primary' },
  [STATUSES.ACCEPTED]: { label: 'Accepted', badgeVariant: 'success' },
  [STATUSES.CLOSED]: { label: 'Closed', badgeVariant: 'default' },
  [STATUSES.REJECTED]: { label: 'Rejected', badgeVariant: 'danger' },
  [STATUSES.REOPENED]: { label: 'Reopened', badgeVariant: 'danger' },
  [STATUSES.ESCALATED]: { label: 'Escalated', badgeVariant: 'danger' },
};

/**
 * Maps contract errors to user-friendly notifications.
 * @param {any} err
 * @returns {string}
 */
export function parseContractError(err) {
  if (!err) return 'An unknown error occurred.';

  // MetaMask rejection
  if (err.code === 4001 || err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('user rejected'))) {
    return 'Transaction rejected by user in MetaMask.';
  }

  // Insufficient gas
  if (err.code === 'INSUFFICIENT_FUNDS' || (err.message && err.message.includes('insufficient funds'))) {
    return 'Insufficient ETH balance in your wallet to pay for transaction gas fees.';
  }

  // Contract custom errors
  const errString = String(err.message || err.shortMessage || err);

  if (errString.includes('Unauthorized') || errString.includes('isCitizen')) {
    return 'Unauthorized: Your wallet is not registered as a Citizen on-chain. Please complete citizen registration first.';
  }
  if (errString.includes('InvalidTitle')) {
    return 'Title is invalid. It must be between 1 and 200 UTF-8 bytes.';
  }
  if (errString.includes('EmptyIPFSCid')) {
    return 'IPFS CID is required and cannot be empty.';
  }
  if (errString.includes('EmptyContentHash')) {
    return 'Description content hash is required.';
  }
  if (errString.includes('DepartmentNotFound')) {
    return 'The selected department was not found on the blockchain.';
  }
  if (errString.includes('DepartmentNotActive')) {
    return 'The selected department is currently deactivated and cannot accept new grievances.';
  }
  if (errString.includes('CategoryNotFound')) {
    return 'The selected grievance category was not found on the blockchain.';
  }
  if (errString.includes('CategoryNotActive')) {
    return 'The selected category is currently deactivated.';
  }
  if (errString.includes('AlreadyRegistered')) {
    return 'Wallet is already registered in RoleManager.';
  }

  if (errString.includes('InvalidStatusTransition')) {
    return 'Invalid status transition: The grievance is not in the required state for this action.';
  }
  if (errString.includes('NotAssignedOfficer')) {
    return 'You are not the assigned officer for this grievance.';
  }
  if (errString.includes('NotGrievanceOwner')) {
    return 'You are not the citizen who filed this grievance.';
  }
  if (errString.includes('GrievanceAlreadyAssigned')) {
    return 'This grievance is already assigned to an officer.';
  }
  if (errString.includes('OfficerNotInDepartment')) {
    return 'The selected officer is not a member of this grievance\'s department.';
  }
  if (errString.includes('ResolutionAlreadyPending')) {
    return 'A resolution is already pending review for this grievance.';
  }
  if (errString.includes('ResolutionNotFound')) {
    return 'No pending resolution found for this grievance.';
  }
  if (errString.includes('EvidenceAlreadyRevoked')) {
    return 'This evidence item has already been revoked.';
  }
  if (errString.includes('CannotReassignToSameOfficer')) {
    return 'Cannot reassign to the same officer who is already assigned.';
  }
  if (errString.includes('SLANotBreached')) {
    return 'The SLA deadline has not been breached yet.';
  }
  if (errString.includes('AlreadyEscalated')) {
    return 'This grievance has already been escalated.';
  }

  return err.shortMessage || err.message || 'Transaction failed on the blockchain.';
}

// ========================================================================
//  SHARED HELPERS
// ========================================================================

/**
 * Normalizes a raw Grievance struct from the contract into a plain JS object.
 * @param {object} g - Raw struct from getGrievance()
 * @returns {object}
 */
function _normalizeGrievance(g) {
  return {
    id: Number(g.id),
    citizen: g.citizen,
    status: Number(g.status),
    priority: Number(g.priority),
    reopenCount: Number(g.reopenCount),
    assignedOfficer: g.assignedOfficer,
    departmentId: Number(g.departmentId),
    categoryId: Number(g.categoryId),
    title: g.title,
    descriptionCid: g.descriptionCid,
    descriptionHash: g.descriptionHash,
    createdAt: Number(g.createdAt),
    updatedAt: Number(g.updatedAt),
    slaDeadline: Number(g.slaDeadline),
    currentResolutionId: Number(g.currentResolutionId),
  };
}

// ========================================================================
//  DEPARTMENT & CATEGORY LOOKUPS
// ========================================================================

/**
 * Fetches all active departments directly from the deployed DepartmentManager contract.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ id: number, name: string, admin: string, isActive: boolean }>>}
 */
export async function fetchActiveDepartments(runner) {
  if (!isContractConfigured('DepartmentManager') || !runner) {
    return [];
  }

  const deptManager = getDepartmentManagerContract(runner);
  const totalCountBig = await deptManager.getDepartmentCount();
  const totalCount = Number(totalCountBig);

  if (totalCount === 0) {
    return [];
  }

  const promises = [];
  for (let id = 1; id <= totalCount; id++) {
    promises.push(deptManager.getDepartment(id));
  }

  const results = await Promise.all(promises);

  return results
    .map((dept, index) => ({
      id: index + 1,
      name: dept.name,
      admin: dept.admin,
      isActive: Boolean(dept.isActive),
    }))
    .filter((dept) => dept.isActive);
}

/**
 * Fetches all active grievance categories directly from DepartmentManager contract.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ id: number, name: string, description: string, isActive: boolean }>>}
 */
export async function fetchActiveCategories(runner) {
  if (!isContractConfigured('DepartmentManager') || !runner) {
    return [];
  }

  const deptManager = getDepartmentManagerContract(runner);
  const totalCountBig = await deptManager.getCategoryCount();
  const totalCount = Number(totalCountBig);

  if (totalCount === 0) {
    return [];
  }

  const promises = [];
  for (let id = 1; id <= totalCount; id++) {
    promises.push(deptManager.getCategory(id));
  }

  const results = await Promise.all(promises);

  return results
    .map((cat, index) => ({
      id: index + 1,
      name: cat.name,
      description: cat.description,
      isActive: Boolean(cat.isActive),
    }))
    .filter((cat) => cat.isActive);
}

// ========================================================================
//  GRIEVANCE CREATION (existing — preserved)
// ========================================================================

/**
 * Phase 1: Sends the createGrievance transaction and waits for MetaMask signature.
 * Resolves when the transaction is broadcast to the network (user has signed).
 * The returned `tx` object contains the pending transaction hash.
 *
 * @param {import('ethers').Signer} signer
 * @param {object} params
 * @param {number} params.categoryId
 * @param {number} params.departmentId
 * @param {number} params.priority
 * @param {string} params.title
 * @param {string} params.descriptionCid
 * @param {string} params.descriptionHash
 * @returns {Promise<{ tx: import('ethers').TransactionResponse, grievanceContract: import('ethers').Contract }>}
 */
export async function sendGrievanceTransaction(signer, {
  categoryId,
  departmentId,
  priority,
  title,
  descriptionCid,
  descriptionHash,
}) {
  if (!isContractConfigured('GrievanceSystem')) {
    throw new Error('GrievanceSystem contract is not configured in .env.');
  }

  const grievanceContract = getGrievanceSystemContract(signer);

  // This call triggers MetaMask. It resolves only AFTER the user signs
  // and the transaction is broadcast to the network mempool.
  const tx = await grievanceContract.createGrievance(
    categoryId,
    departmentId,
    priority,
    title,
    descriptionCid,
    descriptionHash
  );

  return { tx, grievanceContract };
}

/**
 * Phase 2: Waits for the pending transaction to be mined and parses the receipt.
 * Extracts the grievance ID from the GrievanceCreated event.
 *
 * @param {import('ethers').TransactionResponse} tx - Pending transaction from Phase 1
 * @param {import('ethers').Contract} grievanceContract - Contract instance for event parsing
 * @returns {Promise<{ grievanceId: number, txHash: string, blockNumber: number, receipt: import('ethers').TransactionReceipt }>}
 */
export async function waitForGrievanceConfirmation(tx, grievanceContract) {
  // Wait for on-chain block confirmation
  const receipt = await tx.wait();

  // Parse receipt logs to extract grievance ID from GrievanceCreated event
  let grievanceId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = grievanceContract.interface.parseLog(log);
      if (parsed && parsed.name === 'GrievanceCreated') {
        grievanceId = Number(parsed.args.grievanceId);
        break;
      }
    } catch {
      // Log belongs to a different interface or not decodable; continue
    }
  }

  if (!grievanceId) {
    // Fallback: query total count if event could not be decoded
    const totalCount = await grievanceContract.getGrievanceCount();
    grievanceId = Number(totalCount);
  }

  return {
    grievanceId,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    receipt,
  };
}

/**
 * Convenience wrapper: sends and confirms a grievance in one call.
 * For UI flows that need distinct AWAITING_WALLET → MINING states, use
 * sendGrievanceTransaction() + waitForGrievanceConfirmation() separately.
 *
 * @param {import('ethers').Signer} signer
 * @param {object} params
 * @returns {Promise<{ grievanceId: number, txHash: string, blockNumber: number, receipt: import('ethers').TransactionReceipt }>}
 */
export async function submitGrievance(signer, params) {
  const { tx, grievanceContract } = await sendGrievanceTransaction(signer, params);
  return waitForGrievanceConfirmation(tx, grievanceContract);
}

// ========================================================================
//  AUDIT TRAIL VERIFICATION (existing — preserved)
// ========================================================================

/**
 * Verifies on-chain AuditTrail entry for a created grievance.
 * Checks that AuditTrail has recorded GRIEVANCE_CREATED (action 8) with the citizen and descriptionHash.
 *
 * @param {import('ethers').ContractRunner} runner
 * @param {number} grievanceId
 * @param {string} citizenAddress
 * @param {string} descriptionHash
 * @returns {Promise<{ isVerified: boolean, auditId?: number, action?: string, timestamp?: number, reason?: string }>}
 */
export async function verifyAuditRecord(runner, grievanceId, citizenAddress, descriptionHash) {
  if (!isContractConfigured('AuditTrail') || !runner || !grievanceId) {
    return { isVerified: false, reason: 'AuditTrail contract not configured.' };
  }

  try {
    const auditTrail = getAuditTrailContract(runner);
    const auditIds = await auditTrail.getAuditsByTarget(grievanceId);

    if (!auditIds || auditIds.length === 0) {
      return { isVerified: false, reason: 'No audit records found for this grievance ID.' };
    }

    for (const auditIdBig of auditIds) {
      const entry = await auditTrail.getAuditEntry(auditIdBig);
      const actionNumber = Number(entry.action);

      // AuditAction.GRIEVANCE_CREATED is 8
      if (actionNumber === 8) {
        const actorMatches = entry.actor.toLowerCase() === citizenAddress.toLowerCase();
        const hashMatches = !descriptionHash || entry.detailsHash.toLowerCase() === descriptionHash.toLowerCase();

        if (actorMatches && hashMatches) {
          return {
            isVerified: true,
            auditId: Number(entry.id),
            action: 'GRIEVANCE_CREATED',
            actor: entry.actor,
            targetId: Number(entry.targetId),
            detailsHash: entry.detailsHash,
            timestamp: Number(entry.timestamp),
          };
        }
      }
    }

    return { isVerified: false, reason: 'GRIEVANCE_CREATED audit entry did not match actor or content commitment.' };
  } catch (err) {
    console.warn('AuditTrail verification query failed:', err);
    return { isVerified: false, reason: err.message || 'Audit query failed.' };
  }
}

// ========================================================================
//  GRIEVANCE DETAIL & LIST QUERIES
// ========================================================================

/**
 * Fetches full grievance details directly from the deployed GrievanceSystem contract.
 * @param {import('ethers').ContractRunner} runner
 * @param {number|string} grievanceId
 * @returns {Promise<object>} Full Grievance struct
 */
export async function fetchGrievanceDetails(runner, grievanceId) {
  if (!isContractConfigured('GrievanceSystem') || !runner) {
    throw new Error('GrievanceSystem contract is not configured.');
  }

  const grievanceContract = getGrievanceSystemContract(runner);
  const exists = await grievanceContract.grievanceExists(grievanceId);

  if (!exists) {
    throw new Error(`Grievance #${grievanceId} does not exist on the blockchain.`);
  }

  const g = await grievanceContract.getGrievance(grievanceId);
  return _normalizeGrievance(g);
}

/**
 * Queries all real on-chain grievances filed by a citizen wallet.
 * @param {import('ethers').ContractRunner} runner
 * @param {string} citizenAddress
 * @returns {Promise<Array<object>>}
 */
export async function fetchCitizenGrievances(runner, citizenAddress) {
  if (!isContractConfigured('GrievanceSystem') || !runner || !citizenAddress) {
    return [];
  }

  const grievanceContract = getGrievanceSystemContract(runner);
  const totalCountBig = await grievanceContract.getGrievanceCount();
  const totalCount = Number(totalCountBig);

  if (totalCount === 0) {
    return [];
  }

  // Iterate backwards from latest to earliest (max 50 to keep query bounded)
  const maxToScan = Math.min(totalCount, 50);
  const ownerCheckPromises = [];

  for (let i = 0; i < maxToScan; i++) {
    const id = totalCount - i;
    ownerCheckPromises.push(
      grievanceContract.isGrievanceOwner(id, citizenAddress).then((isOwner) => ({ id, isOwner }))
    );
  }

  const checks = await Promise.all(ownerCheckPromises);
  const myGrievanceIds = checks.filter((c) => c.isOwner).map((c) => c.id);

  if (myGrievanceIds.length === 0) {
    return [];
  }

  const detailsPromises = myGrievanceIds.map((id) => grievanceContract.getGrievance(id));
  const records = await Promise.all(detailsPromises);
  return records.map(_normalizeGrievance);
}

/**
 * Queries all real on-chain grievances assigned to a specific officer wallet.
 * @param {import('ethers').ContractRunner} runner
 * @param {string} officerAddress
 * @returns {Promise<Array<object>>} Normalized list of assigned grievances
 */
export async function fetchOfficerGrievances(runner, officerAddress) {
  if (!isContractConfigured('GrievanceSystem') || !runner || !officerAddress) {
    return [];
  }

  const grievanceContract = getGrievanceSystemContract(runner);
  const totalCountBig = await grievanceContract.getGrievanceCount();
  const totalCount = Number(totalCountBig);

  if (totalCount === 0) {
    return [];
  }

  // Iterate backwards from latest to earliest (bounded to latest 100 cases)
  const maxToScan = Math.min(totalCount, 100);
  const assignmentCheckPromises = [];

  for (let i = 0; i < maxToScan; i++) {
    const id = totalCount - i;
    assignmentCheckPromises.push(
      grievanceContract.isAssignedOfficer(id, officerAddress).then((isAssigned) => ({ id, isAssigned }))
    );
  }

  const checks = await Promise.all(assignmentCheckPromises);
  const assignedIds = checks.filter((c) => c.isAssigned).map((c) => c.id);

  if (assignedIds.length === 0) {
    return [];
  }

  const detailsPromises = assignedIds.map((id) => grievanceContract.getGrievance(id));
  const records = await Promise.all(detailsPromises);
  return records.map(_normalizeGrievance);
}

/**
 * Fetches all grievances from the contract (bounded scan).
 * @param {import('ethers').ContractRunner} runner
 * @param {number} [maxCount=200]
 * @returns {Promise<Array<object>>}
 */
export async function fetchAllGrievances(runner, maxCount = 200) {
  if (!isContractConfigured('GrievanceSystem') || !runner) return [];

  const contract = getGrievanceSystemContract(runner);
  const totalCountBig = await contract.getGrievanceCount();
  const totalCount = Number(totalCountBig);
  if (totalCount === 0) return [];

  const toFetch = Math.min(totalCount, maxCount);
  const promises = [];
  for (let id = totalCount; id > totalCount - toFetch; id--) {
    promises.push(contract.getGrievance(id));
  }

  const records = await Promise.all(promises);
  return records.map(_normalizeGrievance);
}

/**
 * Fetches grievances belonging to a specific department.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} departmentId
 * @param {number} [maxCount=200]
 * @returns {Promise<Array<object>>}
 */
export async function fetchDepartmentGrievances(runner, departmentId, maxCount = 200) {
  const all = await fetchAllGrievances(runner, maxCount);
  return all.filter((g) => g.departmentId === departmentId);
}

// ========================================================================
//  OFFICER WORKFLOW — Status Transitions
//  Verified against GrievanceSystem.sol:
//    startReview(uint256 grievanceId) — line 592
//    startInvestigation(uint256 grievanceId) — line 602
// ========================================================================

/**
 * Officer: Transitions grievance from ASSIGNED → UNDER_REVIEW.
 * Calls GrievanceSystem.startReview(grievanceId).
 * Authorization: assigned officer only (_requireAssignedOfficer).
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function transitionToReview(signer, grievanceId) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.startReview(grievanceId);
  return tx.wait();
}

/**
 * Officer: Transitions grievance from UNDER_REVIEW → UNDER_INVESTIGATION.
 * Calls GrievanceSystem.startInvestigation(grievanceId).
 * Authorization: assigned officer only (_requireAssignedOfficer).
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function transitionToInvestigation(signer, grievanceId) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.startInvestigation(grievanceId);
  return tx.wait();
}

// ========================================================================
//  INVESTIGATION NOTES
//  Verified: addInvestigationNote(uint256, string, bytes32) — line 618
//  View: getGrievanceInvestigationNotes(uint256) — line 1140
//  View: getInvestigationNote(uint256) — line 1150
// ========================================================================

/**
 * Officer: Appends an investigation note to a grievance.
 * Grievance must be UNDER_REVIEW or UNDER_INVESTIGATION.
 * Authorization: assigned officer only.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @param {string} contentCid - IPFS CID of the note content
 * @param {string} contentHash - keccak256 hash (bytes32 hex) of note content
 * @returns {Promise<{ receipt: import('ethers').TransactionReceipt, noteId: number|null }>}
 */
export async function addInvestigationNote(signer, grievanceId, contentCid, contentHash) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.addInvestigationNote(grievanceId, contentCid, contentHash);
  const receipt = await tx.wait();

  let noteId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'InvestigationNoteAdded') {
        noteId = Number(parsed.args.noteId);
        break;
      }
    } catch { /* skip */ }
  }

  return { receipt, noteId };
}

/**
 * Fetches all investigation notes for a grievance from the contract.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} grievanceId
 * @returns {Promise<Array<{ id: number, grievanceId: number, investigator: string, contentCid: string, contentHash: string, timestamp: number }>>}
 */
export async function fetchInvestigationNotes(runner, grievanceId) {
  if (!isContractConfigured('GrievanceSystem') || !runner) return [];

  const contract = getGrievanceSystemContract(runner);
  const noteIds = await contract.getGrievanceInvestigationNotes(grievanceId);

  if (!noteIds || noteIds.length === 0) return [];

  const promises = noteIds.map((nid) => contract.getInvestigationNote(nid));
  const notes = await Promise.all(promises);

  return notes.map((n) => ({
    id: Number(n.id),
    grievanceId: Number(n.grievanceId),
    investigator: n.investigator,
    contentCid: n.contentCid,
    contentHash: n.contentHash,
    timestamp: Number(n.timestamp),
  }));
}

// ========================================================================
//  EVIDENCE MANAGEMENT
//  Verified: addEvidence(uint256, EvidenceType, string, bytes32) — line 674
//  Authorization: citizen owner, assigned officer, super admin, dept admin
//  View: getGrievanceEvidence(uint256) — line 1174
//  View: getEvidence(uint256) — line 1184
// ========================================================================

/**
 * EvidenceType enum matching GrievanceTypes.sol.
 */
export const EVIDENCE_TYPES = {
  DOCUMENT: 0,
  IMAGE: 1,
  VIDEO: 2,
  AUDIO: 3,
  OTHER: 4,
};

export const EVIDENCE_TYPE_LABELS = {
  [EVIDENCE_TYPES.DOCUMENT]: 'Document',
  [EVIDENCE_TYPES.IMAGE]: 'Image',
  [EVIDENCE_TYPES.VIDEO]: 'Video',
  [EVIDENCE_TYPES.AUDIO]: 'Audio',
  [EVIDENCE_TYPES.OTHER]: 'Other',
};

/**
 * Attaches evidence to a grievance on-chain.
 * Authorization: citizen owner, assigned officer, super admin, or dept admin.
 * Grievance must NOT be CLOSED.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @param {number} evidenceType - EvidenceType enum value
 * @param {string} ipfsCid - IPFS CID of the evidence file
 * @param {string} contentHash - keccak256 hash (bytes32 hex) of evidence
 * @returns {Promise<{ receipt: import('ethers').TransactionReceipt, evidenceId: number|null }>}
 */
export async function addEvidence(signer, grievanceId, evidenceType, ipfsCid, contentHash) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.addEvidence(grievanceId, evidenceType, ipfsCid, contentHash);
  const receipt = await tx.wait();

  let evidenceId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'EvidenceAdded') {
        evidenceId = Number(parsed.args.evidenceId);
        break;
      }
    } catch { /* skip */ }
  }

  return { receipt, evidenceId };
}

/**
 * Fetches all evidence records for a grievance from the contract.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} grievanceId
 * @returns {Promise<Array<object>>}
 */
export async function fetchGrievanceEvidence(runner, grievanceId) {
  if (!isContractConfigured('GrievanceSystem') || !runner) return [];

  const contract = getGrievanceSystemContract(runner);
  const evidenceIds = await contract.getGrievanceEvidence(grievanceId);

  if (!evidenceIds || evidenceIds.length === 0) return [];

  const promises = evidenceIds.map((eid) => contract.getEvidence(eid));
  const items = await Promise.all(promises);

  return items.map((e) => ({
    id: Number(e.id),
    grievanceId: Number(e.grievanceId),
    submitter: e.submitter,
    evidenceType: Number(e.evidenceType),
    isActive: Boolean(e.isActive),
    ipfsCid: e.ipfsCid,
    contentHash: e.contentHash,
    submittedAt: Number(e.submittedAt),
  }));
}

// ========================================================================
//  RESOLUTION LIFECYCLE
//  Verified: submitResolution(uint256, string, bytes32) — line 772
//  Verified: acceptResolution(uint256) — line 830
//  Verified: rejectResolution(uint256, bytes32) — line 860
//  View: getGrievanceResolutions(uint256) — line 1208
//  View: getResolution(uint256) — line 1218
// ========================================================================

/**
 * ResolutionStatus enum matching GrievanceTypes.sol.
 */
export const RESOLUTION_STATUSES = {
  PENDING: 0,
  ACCEPTED: 1,
  REJECTED: 2,
};

/**
 * Officer: Submits a resolution proposal.
 * Transitions: UNDER_INVESTIGATION → RESOLUTION_PROPOSED → CITIZEN_REVIEW.
 * Authorization: assigned officer only.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @param {string} resolutionCid - IPFS CID of the resolution
 * @param {string} resolutionHash - keccak256 hash (bytes32 hex)
 * @returns {Promise<{ receipt: import('ethers').TransactionReceipt, resolutionId: number|null }>}
 */
export async function submitResolution(signer, grievanceId, resolutionCid, resolutionHash) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.submitResolution(grievanceId, resolutionCid, resolutionHash);
  const receipt = await tx.wait();

  let resolutionId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'ResolutionSubmitted') {
        resolutionId = Number(parsed.args.resolutionId);
        break;
      }
    } catch { /* skip */ }
  }

  return { receipt, resolutionId };
}

/**
 * Citizen: Accepts the proposed resolution.
 * Transitions: CITIZEN_REVIEW → ACCEPTED.
 * Authorization: citizen who filed the grievance only.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function acceptResolution(signer, grievanceId) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.acceptResolution(grievanceId);
  return tx.wait();
}

/**
 * Citizen: Rejects the proposed resolution.
 * Transitions: CITIZEN_REVIEW → REJECTED.
 * Authorization: citizen who filed the grievance only.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @param {string} rejectionReasonHash - keccak256 hash (bytes32 hex) of rejection reason
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function rejectResolution(signer, grievanceId, rejectionReasonHash) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.rejectResolution(grievanceId, rejectionReasonHash);
  return tx.wait();
}

/**
 * Fetches all resolution records for a grievance from the contract.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} grievanceId
 * @returns {Promise<Array<object>>}
 */
export async function fetchGrievanceResolutions(runner, grievanceId) {
  if (!isContractConfigured('GrievanceSystem') || !runner) return [];

  const contract = getGrievanceSystemContract(runner);
  const resolutionIds = await contract.getGrievanceResolutions(grievanceId);

  if (!resolutionIds || resolutionIds.length === 0) return [];

  const promises = resolutionIds.map((rid) => contract.getResolution(rid));
  const items = await Promise.all(promises);

  return items.map((r) => ({
    id: Number(r.id),
    grievanceId: Number(r.grievanceId),
    proposedBy: r.proposedBy,
    status: Number(r.status),
    resolutionCid: r.resolutionCid,
    resolutionHash: r.resolutionHash,
    rejectionReasonHash: r.rejectionReasonHash,
    proposedAt: Number(r.proposedAt),
    reviewedAt: Number(r.reviewedAt),
  }));
}

// ========================================================================
//  CITIZEN LIFECYCLE — Reopen & Close
//  Verified: reopenGrievance(uint256) — line 894
//  Verified: closeGrievance(uint256) — line 918
// ========================================================================

/**
 * Citizen: Reopens a rejected grievance.
 * Transitions: REJECTED → REOPENED.
 * Authorization: citizen who filed the grievance only.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function reopenGrievance(signer, grievanceId) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.reopenGrievance(grievanceId);
  return tx.wait();
}

/**
 * Closes an accepted grievance.
 * Transitions: ACCEPTED → CLOSED.
 * Authorization: citizen owner, super admin, or dept admin.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function closeGrievance(signer, grievanceId) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.closeGrievance(grievanceId);
  return tx.wait();
}

// ========================================================================
//  ADMIN OPERATIONS — Registration & Assignment
//  Verified: registerGrievance(uint256) — line 475
//  Verified: assignOfficer(uint256, address) — line 496
//  Verified: reassignOfficer(uint256, address) — line 538
// ========================================================================

/**
 * Admin: Registers intake of a submitted grievance.
 * Transitions: SUBMITTED → REGISTERED.
 * Authorization: super admin or assigned dept admin.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function registerGrievance(signer, grievanceId) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.registerGrievance(grievanceId);
  return tx.wait();
}

/**
 * Admin: Assigns an officer to a grievance.
 * Transitions: REGISTERED or REOPENED → ASSIGNED.
 * Authorization: super admin or assigned dept admin.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @param {string} officerAddress
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function assignOfficer(signer, grievanceId, officerAddress) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.assignOfficer(grievanceId, officerAddress);
  return tx.wait();
}

/**
 * Admin: Reassigns a grievance to a different officer.
 * Authorization: super admin or assigned dept admin.
 *
 * @param {import('ethers').Signer} signer
 * @param {number} grievanceId
 * @param {string} newOfficerAddress
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function reassignOfficer(signer, grievanceId, newOfficerAddress) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.reassignOfficer(grievanceId, newOfficerAddress);
  return tx.wait();
}

/**
 * Fetches assignment history for a grievance from the contract.
 * @param {import('ethers').ContractRunner} runner
 * @param {number} grievanceId
 * @returns {Promise<Array<object>>}
 */
export async function fetchAssignmentHistory(runner, grievanceId) {
  if (!isContractConfigured('GrievanceSystem') || !runner) return [];

  const contract = getGrievanceSystemContract(runner);
  const assignmentIds = await contract.getGrievanceAssignments(grievanceId);

  if (!assignmentIds || assignmentIds.length === 0) return [];

  const promises = assignmentIds.map((aid) => contract.getAssignment(aid));
  const items = await Promise.all(promises);

  return items.map((a) => ({
    grievanceId: Number(a.grievanceId),
    departmentId: Number(a.departmentId),
    assignedOfficer: a.assignedOfficer,
    assignedBy: a.assignedBy,
    assignedAt: Number(a.assignedAt),
  }));
}

// ========================================================================
//  SLA CONFIGURATION
//  Verified: updateSlaDuration(Priority, uint256) — line 358
//  Verified: getSlaDuration(Priority) — line 1049
// ========================================================================

/**
 * Super Admin: Updates the SLA duration for a priority tier.
 * @param {import('ethers').Signer} signer
 * @param {number} priority - Priority enum value (0-3)
 * @param {number} newDurationSeconds
 * @returns {Promise<import('ethers').TransactionReceipt>}
 */
export async function updateSlaDuration(signer, priority, newDurationSeconds) {
  const contract = getGrievanceSystemContract(signer);
  const tx = await contract.updateSlaDuration(priority, newDurationSeconds);
  return tx.wait();
}

/**
 * Fetches SLA durations for all 4 priority tiers.
 * @param {import('ethers').ContractRunner} runner
 * @returns {Promise<Array<{ priority: number, label: string, durationSeconds: number }>>}
 */
export async function fetchSlaDurations(runner) {
  if (!isContractConfigured('GrievanceSystem') || !runner) return [];

  const contract = getGrievanceSystemContract(runner);
  const results = await Promise.all([
    contract.getSlaDuration(PRIORITIES.LOW),
    contract.getSlaDuration(PRIORITIES.MEDIUM),
    contract.getSlaDuration(PRIORITIES.HIGH),
    contract.getSlaDuration(PRIORITIES.CRITICAL),
  ]);

  return [
    { priority: PRIORITIES.LOW, label: 'Low', durationSeconds: Number(results[0]) },
    { priority: PRIORITIES.MEDIUM, label: 'Medium', durationSeconds: Number(results[1]) },
    { priority: PRIORITIES.HIGH, label: 'High', durationSeconds: Number(results[2]) },
    { priority: PRIORITIES.CRITICAL, label: 'Critical', durationSeconds: Number(results[3]) },
  ];
}

// ========================================================================
//  EVIDENCE REVOCATION
//  Verified: revokeEvidence(uint256 evidenceId, string calldata reason) — line 739
// ========================================================================

/**
 * Super Admin or assigned Department Admin: Revokes an evidence record.
 * Supports signature (signer, evidenceId, reason) or (signer, grievanceId, evidenceId, reason).
 */
export async function revokeEvidence(signer, arg1, arg2, arg3) {
  const contract = getGrievanceSystemContract(signer);
  let evidenceId;
  let reason;
  if (arg3 !== undefined) {
    evidenceId = arg2;
    reason = arg3;
  } else {
    evidenceId = arg1;
    reason = arg2;
  }
  const tx = await contract.revokeEvidence(evidenceId, reason || '');
  return tx.wait();
}

// ========================================================================
//  CONVENIENCE ALIAS EXPORTS
// ========================================================================
export const startReview = transitionToReview;
export const startInvestigation = transitionToInvestigation;
export const fetchGrievancesByDepartment = fetchDepartmentGrievances;
export const fetchResolutionHistory = fetchGrievanceResolutions;
export const fetchEvidenceList = fetchGrievanceEvidence;


