// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AuditAction} from "./GrievanceTypes.sol";

/**
 * @title IAuditTrail
 * @notice Standard interface for the system-wide append-only audit trail ledger.
 *         Allows business contracts (RoleManager, DepartmentManager, GrievanceSystem,
 *         EscalationManager) to append immutable audit records without tight coupling
 *         or circular dependencies.
 */
interface IAuditTrail {
    /**
     * @notice Appends an immutable audit entry to the audit trail.
     * @dev Caller must be an authorized audit writer contract.
     *
     * @param action Categorized audit action from the AuditAction enum.
     * @param actor The wallet address that performed the action.
     * @param targetId Contextual target identifier (e.g., grievanceId, departmentId, or uint256(uint160(account))).
     * @param detailsHash keccak256 hash of metadata, parameters, or description for off-chain integrity.
     * @return auditId The unique, monotonically assigned audit record ID.
     */
    function recordAudit(
        AuditAction action,
        address actor,
        uint256 targetId,
        bytes32 detailsHash
    ) external returns (uint256 auditId);
}
