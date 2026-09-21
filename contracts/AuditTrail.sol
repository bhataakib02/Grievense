// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RoleManager} from "./RoleManager.sol";
import {IAuditTrail} from "./IAuditTrail.sol";
import {
    AuditAction,
    AuditEntry,
    // Shared Custom Errors
    Unauthorized,
    ZeroAddressNotAllowed,
    ValueOutOfRange
} from "./GrievanceTypes.sol";

/**
 * @title AuditTrail
 * @notice Tamper-evident, append-only historical audit log for the Blockchain-Based Public
 *         Grievance Tracking System.
 *
 * Architecture:
 *   - Serves as the central immutable ledger for all auditable system mutations.
 *   - Only authorized writer contracts (RoleManager, DepartmentManager, GrievanceSystem,
 *     EscalationManager) may record audit entries.
 *   - Super Admin manages authorized writers via RoleManager access control.
 *   - Individual audit records are strictly append-only: once written, entries cannot be modified,
 *     overwritten, or deleted by any actor or administrator.
 *
 * Target ID Semantics:
 *   - Grievance actions (GRIEVANCE_*, STATUS_*, INVESTIGATION_*, EVIDENCE_*, RESOLUTION_*):
 *     targetId = unique grievanceId.
 *   - Department actions (DEPARTMENT_*, OFFICER_*): targetId = departmentId.
 *   - Category actions (CATEGORY_*): targetId = categoryId.
 *   - User / Role actions (USER_REGISTERED, ROLE_GRANTED, ROLE_REVOKED):
 *     targetId = uint256(uint160(accountAddress)).
 *   - System SLA actions (SLA_UPDATED): targetId = uint256(priorityTier).
 *
 * Integrity & Details Hash:
 *   - detailsHash represents a keccak256 commitment of off-chain metadata, parameters, or reasons.
 *   - If an action has no supplementary details, bytes32(0) is recorded.
 */
contract AuditTrail is IAuditTrail {

    // ========================================================================
    //  DEPENDENCIES
    // ========================================================================

    /// @notice Reference to RoleManager for authorization checks.
    RoleManager public immutable roleManager;

    // ========================================================================
    //  STATE — Counters & Storage
    // ========================================================================

    /// @dev Monotonically increasing audit entry counter (1-indexed; ID 0 is reserved).
    uint256 private _nextAuditId = 1;

    /// @dev Primary audit store: auditId => AuditEntry struct.
    mapping(uint256 => AuditEntry) private _auditEntries;

    /// @dev Authorized contract writers: contractAddress => isAuthorized.
    mapping(address => bool) private _authorizedWriters;

    /// @dev Index by target entity: targetId => array of audit IDs.
    mapping(uint256 => uint256[]) private _targetAudits;

    /// @dev Index by actor wallet: actorAddress => array of audit IDs.
    mapping(address => uint256[]) private _actorAudits;

    // ========================================================================
    //  CUSTOM ERRORS
    // ========================================================================

    /// @notice Caller is not an authorized audit writer contract.
    error WriterNotAuthorized(address caller);

    /// @notice Referenced audit entry does not exist.
    error AuditEntryNotFound(uint256 auditId);

    // ========================================================================
    //  EVENTS
    // ========================================================================

    /// @notice Emitted whenever a new audit entry is permanently recorded.
    event AuditRecorded(
        uint256 indexed auditId,
        AuditAction indexed action,
        address indexed actor,
        uint256 targetId,
        bytes32 detailsHash,
        uint64 timestamp
    );

    /// @notice Emitted when an authorized writer contract is added or revoked.
    event AuditWriterUpdated(
        address indexed writer,
        bool authorized,
        address indexed updatedBy,
        uint64 timestamp
    );

    // ========================================================================
    //  MODIFIERS
    // ========================================================================

    /// @dev Restricts execution to Super Admin in RoleManager.
    modifier onlySuperAdmin() {
        if (!roleManager.isSuperAdmin(msg.sender)) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN");
        }
        _;
    }

    /// @dev Restricts execution to authorized writer contracts.
    modifier onlyAuthorizedWriter() {
        if (!_authorizedWriters[msg.sender]) {
            revert WriterNotAuthorized(msg.sender);
        }
        _;
    }

    // ========================================================================
    //  CONSTRUCTOR
    // ========================================================================

    /**
     * @notice Initializes AuditTrail with RoleManager reference for authorization.
     * @param roleManagerAddress Deployed RoleManager address.
     */
    constructor(address roleManagerAddress) {
        if (roleManagerAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        roleManager = RoleManager(roleManagerAddress);
    }

    // ========================================================================
    //  WRITER ADMINISTRATION
    // ========================================================================

    /**
     * @notice Authorizes or revokes a contract's permission to append audit entries.
     * @dev Only callable by Super Admin.
     * @param writer Contract address to authorize or revoke.
     * @param authorized True to authorize, false to revoke.
     */
    function setAuthorizedWriter(address writer, bool authorized) external onlySuperAdmin {
        if (writer == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        _authorizedWriters[writer] = authorized;
        emit AuditWriterUpdated(writer, authorized, msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Checks whether an address is an authorized audit writer.
     * @param writer Address to check.
     * @return True if authorized.
     */
    function isAuthorizedWriter(address writer) external view returns (bool) {
        return _authorizedWriters[writer];
    }

    // ========================================================================
    //  AUDIT RECORDING
    // ========================================================================

    /**
     * @notice Appends an immutable audit entry to the audit trail.
     * @dev Only callable by authorized writer contracts.
     *      Records the actual originating actor provided by the caller contract.
     *
     * @param action The categorized audit action from the AuditAction enum.
     * @param actor The wallet address that performed the action (must be non-zero).
     * @param targetId Contextual target identifier (e.g., grievanceId, departmentId).
     * @param detailsHash keccak256 hash of off-chain metadata or description.
     * @return auditId The unique, monotonically assigned audit record ID.
     */
    function recordAudit(
        AuditAction action,
        address actor,
        uint256 targetId,
        bytes32 detailsHash
    ) external onlyAuthorizedWriter returns (uint256 auditId) {
        if (actor == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        auditId = _nextAuditId++;
        uint64 now_ = uint64(block.timestamp);

        _auditEntries[auditId] = AuditEntry({
            id: auditId,
            action: action,
            actor: actor,
            targetId: targetId,
            detailsHash: detailsHash,
            timestamp: now_
        });

        _targetAudits[targetId].push(auditId);
        _actorAudits[actor].push(auditId);

        emit AuditRecorded(auditId, action, actor, targetId, detailsHash, now_);
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Audit Queries
    // ========================================================================

    /**
     * @notice Retrieves a specific audit entry by its unique ID.
     * @param auditId The audit entry identifier.
     * @return The AuditEntry struct.
     */
    function getAuditEntry(uint256 auditId) external view returns (AuditEntry memory) {
        if (auditId == 0 || auditId >= _nextAuditId) {
            revert AuditEntryNotFound(auditId);
        }
        return _auditEntries[auditId];
    }

    /**
     * @notice Checks whether an audit entry ID exists.
     * @param auditId The ID to check.
     * @return True if the audit entry exists.
     */
    function auditExists(uint256 auditId) external view returns (bool) {
        return auditId >= 1 && auditId < _nextAuditId;
    }

    /**
     * @notice Returns the total number of audit records created.
     * @return Total audit count.
     */
    function getAuditCount() external view returns (uint256) {
        return _nextAuditId - 1;
    }

    /**
     * @notice Returns all audit IDs associated with a specific target.
     * @param targetId The contextual target identifier (e.g., grievanceId).
     * @return Array of matching audit IDs.
     */
    function getAuditsByTarget(uint256 targetId) external view returns (uint256[] memory) {
        return _targetAudits[targetId];
    }

    /**
     * @notice Returns all audit IDs for actions performed by a specific actor.
     * @param actor The wallet address to query.
     * @return Array of matching audit IDs.
     */
    function getAuditsByActor(address actor) external view returns (uint256[] memory) {
        return _actorAudits[actor];
    }

    /**
     * @notice Returns a paginated range of audit entries for frontend inspection.
     * @dev Maximum batch size is 100 records to prevent block gas limits.
     *
     * @param startId Starting audit ID (inclusive, minimum 1).
     * @param endId Ending audit ID (inclusive, must be >= startId).
     * @return entries An array of AuditEntry structs within the specified range.
     */
    function getAuditEntries(
        uint256 startId,
        uint256 endId
    ) external view returns (AuditEntry[] memory entries) {
        if (startId == 0 || startId >= _nextAuditId) {
            revert ValueOutOfRange("startId", startId, 1, _nextAuditId > 1 ? _nextAuditId - 1 : 1);
        }

        uint256 lastId = _nextAuditId - 1;
        uint256 effectiveEnd = endId > lastId ? lastId : endId;

        if (effectiveEnd < startId) {
            revert ValueOutOfRange("endId", effectiveEnd, startId, lastId);
        }

        uint256 count = effectiveEnd - startId + 1;
        if (count > 100) {
            revert ValueOutOfRange("batchSize", count, 1, 100);
        }

        entries = new AuditEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            entries[i] = _auditEntries[startId + i];
        }
    }
}
