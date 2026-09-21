import { getAuditTrailContract } from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';

export const AUDIT_ACTIONS = {
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
  CATEGORY_UPDATED: 25,
};

export const AUDIT_ACTION_NAMES = {
  [AUDIT_ACTIONS.USER_REGISTERED]: 'User Registered',
  [AUDIT_ACTIONS.ROLE_GRANTED]: 'Role Granted',
  [AUDIT_ACTIONS.ROLE_REVOKED]: 'Role Revoked',
  [AUDIT_ACTIONS.DEPARTMENT_CREATED]: 'Department Created',
  [AUDIT_ACTIONS.DEPARTMENT_UPDATED]: 'Department Updated',
  [AUDIT_ACTIONS.DEPARTMENT_DEACTIVATED]: 'Department Deactivated',
  [AUDIT_ACTIONS.OFFICER_ADDED]: 'Officer Added to Dept',
  [AUDIT_ACTIONS.OFFICER_REMOVED]: 'Officer Removed from Dept',
  [AUDIT_ACTIONS.GRIEVANCE_CREATED]: 'Grievance Created',
  [AUDIT_ACTIONS.GRIEVANCE_REGISTERED]: 'Grievance Registered',
  [AUDIT_ACTIONS.GRIEVANCE_ASSIGNED]: 'Officer Assigned',
  [AUDIT_ACTIONS.GRIEVANCE_REASSIGNED]: 'Officer Reassigned',
  [AUDIT_ACTIONS.STATUS_CHANGED]: 'Status Changed',
  [AUDIT_ACTIONS.INVESTIGATION_STARTED]: 'Investigation Started',
  [AUDIT_ACTIONS.INVESTIGATION_NOTE_ADDED]: 'Investigation Note Added',
  [AUDIT_ACTIONS.EVIDENCE_ADDED]: 'Evidence Added',
  [AUDIT_ACTIONS.EVIDENCE_REVOKED]: 'Evidence Revoked',
  [AUDIT_ACTIONS.RESOLUTION_SUBMITTED]: 'Resolution Submitted',
  [AUDIT_ACTIONS.RESOLUTION_ACCEPTED]: 'Resolution Accepted',
  [AUDIT_ACTIONS.RESOLUTION_REJECTED]: 'Resolution Rejected',
  [AUDIT_ACTIONS.GRIEVANCE_REOPENED]: 'Grievance Reopened',
  [AUDIT_ACTIONS.GRIEVANCE_ESCALATED]: 'Grievance Escalated',
  [AUDIT_ACTIONS.GRIEVANCE_CLOSED]: 'Grievance Closed',
  [AUDIT_ACTIONS.SLA_UPDATED]: 'SLA Duration Updated',
  [AUDIT_ACTIONS.CATEGORY_CREATED]: 'Category Created',
  [AUDIT_ACTIONS.CATEGORY_UPDATED]: 'Category Updated',
};

/**
 * Returns total count of audit records recorded in AuditTrail.
 */
export async function fetchAuditCount(runner) {
  if (!isContractConfigured('AuditTrail') || !runner) return 0;
  try {
    const contract = getAuditTrailContract(runner);
    const count = await contract.getAuditCount();
    return Number(count);
  } catch (err) {
    console.error('fetchAuditCount error:', err);
    return 0;
  }
}

/**
 * Fetches audit entries by target ID (e.g. grievance ID).
 * @param {import('ethers').ContractRunner} runner
 * @param {number} targetId
 * @returns {Promise<Array<{ id: number, action: number, actionName: string, actor: string, targetId: number, detailsHash: string, timestamp: number }>>}
 */
export async function fetchAuditsByTarget(runner, targetId) {
  if (!isContractConfigured('AuditTrail') || !runner) return [];
  try {
    const contract = getAuditTrailContract(runner);
    const auditIds = await contract.getAuditsByTarget(targetId);
    if (!auditIds || auditIds.length === 0) return [];

    const promises = auditIds.map((id) => contract.getAuditEntry(id));
    const entries = await Promise.all(promises);

    return entries.map((e) => {
      const action = Number(e.action);
      return {
        id: Number(e.id),
        action,
        actionName: AUDIT_ACTION_NAMES[action] || `Action #${action}`,
        actor: e.actor,
        targetId: Number(e.targetId),
        detailsHash: e.detailsHash,
        timestamp: Number(e.timestamp),
      };
    });
  } catch (err) {
    console.error('fetchAuditsByTarget error:', err);
    return [];
  }
}

/**
 * Fetches audit entries by actor address.
 */
export async function fetchAuditsByActor(runner, actorAddress) {
  if (!isContractConfigured('AuditTrail') || !runner || !actorAddress) return [];
  try {
    const contract = getAuditTrailContract(runner);
    const auditIds = await contract.getAuditsByActor(actorAddress);
    if (!auditIds || auditIds.length === 0) return [];

    const promises = auditIds.map((id) => contract.getAuditEntry(id));
    const entries = await Promise.all(promises);

    return entries.map((e) => {
      const action = Number(e.action);
      return {
        id: Number(e.id),
        action,
        actionName: AUDIT_ACTION_NAMES[action] || `Action #${action}`,
        actor: e.actor,
        targetId: Number(e.targetId),
        detailsHash: e.detailsHash,
        timestamp: Number(e.timestamp),
      };
    });
  } catch (err) {
    console.error('fetchAuditsByActor error:', err);
    return [];
  }
}

/**
 * Fetches a range of audit entries (up to 100 entries per batch).
 */
export async function fetchAuditEntriesRange(runner, startId, endId) {
  if (!isContractConfigured('AuditTrail') || !runner) return [];
  try {
    const contract = getAuditTrailContract(runner);
    const entries = await contract.getAuditEntries(startId, endId);
    return entries.map((e) => {
      const action = Number(e.action);
      return {
        id: Number(e.id),
        action,
        actionName: AUDIT_ACTION_NAMES[action] || `Action #${action}`,
        actor: e.actor,
        targetId: Number(e.targetId),
        detailsHash: e.detailsHash,
        timestamp: Number(e.timestamp),
      };
    });
  } catch (err) {
    console.error('fetchAuditEntriesRange error:', err);
    return [];
  }
}
