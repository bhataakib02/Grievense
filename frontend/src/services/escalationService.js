import { getEscalationManagerContract } from './blockchain.js';
import { isContractConfigured } from '../contracts/addresses.js';

function parseEscalationError(err) {
  const errString = err?.reason || err?.message || '';
  if (errString.includes('GrievanceNotFound')) {
    return 'Grievance not found.';
  }
  if (errString.includes('AlreadyEscalated')) {
    return 'Grievance is already escalated.';
  }
  if (errString.includes('InvalidStatusTransition')) {
    return 'Invalid status transition: Only grievances actively under investigation can be escalated or resolved.';
  }
  if (errString.includes('SLANotBreached')) {
    return 'SLA deadline has not elapsed yet. Escalation is only permitted after breach.';
  }
  if (errString.includes('DepartmentNotActive')) {
    return 'Department is not active.';
  }
  if (errString.includes('Unauthorized')) {
    return 'Unauthorized: Caller is not a Super Admin or the assigned Department Admin.';
  }
  return err?.shortMessage || err?.message || 'Escalation transaction failed.';
}

/**
 * Checks if an active grievance has breached its SLA deadline.
 */
export async function checkIsSLABreached(runner, grievanceId) {
  if (!isContractConfigured('EscalationManager') || !runner) return false;
  try {
    const contract = getEscalationManagerContract(runner);
    return await contract.isSLABreached(grievanceId);
  } catch (err) {
    console.error('checkIsSLABreached error:', err);
    return false;
  }
}

/**
 * Checks if a grievance meets all requirements to be escalated right now.
 */
export async function checkCanEscalate(runner, grievanceId) {
  if (!isContractConfigured('EscalationManager') || !runner) return false;
  try {
    const contract = getEscalationManagerContract(runner);
    return await contract.canEscalate(grievanceId);
  } catch (err) {
    console.error('checkCanEscalate error:', err);
    return false;
  }
}

/**
 * Checks if a caller has authority to resolve an escalation.
 */
export async function checkCanResolveEscalation(runner, grievanceId, callerAddress) {
  if (!isContractConfigured('EscalationManager') || !runner || !callerAddress) return false;
  try {
    const contract = getEscalationManagerContract(runner);
    return await contract.canResolveEscalation(grievanceId, callerAddress);
  } catch (err) {
    console.error('checkCanResolveEscalation error:', err);
    return false;
  }
}

/**
 * Triggers escalation for a grievance whose SLA has expired.
 * (Permissionless - any interested party can trigger)
 */
export async function escalateGrievance(signer, grievanceId) {
  try {
    const contract = getEscalationManagerContract(signer);
    const tx = await contract.escalateGrievance(grievanceId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseEscalationError(err));
  }
}

/**
 * Resolves an escalated grievance, returning it to UNDER_INVESTIGATION.
 * Super Admin or assigned Dept Admin only.
 */
export async function resolveEscalation(signer, grievanceId) {
  try {
    const contract = getEscalationManagerContract(signer);
    const tx = await contract.resolveEscalation(grievanceId);
    return await tx.wait();
  } catch (err) {
    throw new Error(parseEscalationError(err));
  }
}

/**
 * Fetches all historical escalation records for a grievance.
 * @returns {Promise<Array<{ grievanceId: number, escalatedBy: string, escalatedAt: number, resolvedBy: string, resolvedAt: number }>>}
 */
export async function fetchAllEscalationRecords(runner, grievanceId) {
  if (!isContractConfigured('EscalationManager') || !runner) return [];
  try {
    const contract = getEscalationManagerContract(runner);
    const records = await contract.getAllEscalationRecords(grievanceId);
    return records.map((r) => ({
      grievanceId: Number(r.grievanceId),
      escalatedBy: r.escalatedBy,
      escalatedAt: Number(r.escalatedAt),
      resolvedBy: r.resolvedBy,
      resolvedAt: Number(r.resolvedAt),
    }));
  } catch (err) {
    console.error('fetchAllEscalationRecords error:', err);
    return [];
  }
}
