// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RoleManager} from "./RoleManager.sol";
import {DepartmentManager} from "./DepartmentManager.sol";
import {GrievanceSystem} from "./GrievanceSystem.sol";
import {AuditTrail} from "./AuditTrail.sol";
import {
    Status,
    Priority,
    AuditAction,
    Grievance,
    // Shared Custom Errors
    Unauthorized,
    ZeroAddressNotAllowed,
    GrievanceNotFound,
    InvalidStatusTransition,
    DepartmentNotActive,
    SLANotBreached,
    AlreadyEscalated,
    ValueOutOfRange
} from "./GrievanceTypes.sol";

/**
 * @title EscalationManager
 * @notice SLA breach detection and escalation management contract for the Blockchain-Based
 *         Public Grievance Tracking System.
 *
 * Architecture:
 *   - GrievanceSystem is the sole authoritative source of truth for grievance storage and status.
 *   - EscalationManager does NOT maintain duplicate grievance storage.
 *   - When an SLA deadline is breached during active investigation, EscalationManager validates
 *     the breach and invokes the authorized hook on GrievanceSystem to transition status:
 *
 *         UNDER_INVESTIGATION  ---> (SLA breached) ---> ESCALATED
 *                                                            │
 *         UNDER_INVESTIGATION  <--- (resolveEscalation) ─────┘
 *
 *   - Preserves all historical records: original SLA deadline, assigned officer, investigation
 *     notes, evidence, and past resolution history remain completely intact.
 *   - Tracks append-only historical escalation records for each grievance.
 */
contract EscalationManager {

    // ========================================================================
    //  STRUCTS
    // ========================================================================

    /**
     * @notice Immutable record of an escalation event and its resolution.
     */
    struct EscalationRecord {
        uint256 grievanceId;    // Associated grievance ID
        address escalatedBy;    // Address that triggered the escalation
        uint64 escalatedAt;     // Timestamp when escalation occurred
        address resolvedBy;     // Admin who resolved the escalation (address(0) while pending)
        uint64 resolvedAt;      // Timestamp when resolved (0 while pending)
    }

    // ========================================================================
    //  DEPENDENCIES
    // ========================================================================

    /// @notice RoleManager instance for authorization checks.
    RoleManager public immutable roleManager;

    /// @notice DepartmentManager instance for department validation and admin lookups.
    DepartmentManager public immutable departmentManager;

    /// @notice Authoritative GrievanceSystem contract.
    GrievanceSystem public immutable grievanceSystem;

    /// @notice Authorized AuditTrail contract.
    address public auditTrail;

    // ========================================================================
    //  STATE
    // ========================================================================

    /// @dev Historical escalation records: grievanceId => array of EscalationRecord.
    mapping(uint256 => EscalationRecord[]) private _grievanceEscalations;

    // ========================================================================
    //  EVENTS
    // ========================================================================

    /// @notice Emitted when a grievance is escalated due to SLA breach.
    event GrievanceEscalated(
        uint256 indexed grievanceId,
        address indexed escalatedBy,
        uint256 indexed departmentId,
        uint64 timestamp
    );

    /// @notice Emitted when an authorized administrator resolves an escalation.
    event EscalationResolved(
        uint256 indexed grievanceId,
        address indexed resolvedBy,
        uint256 indexed departmentId,
        uint64 timestamp
    );

    /// @notice Emitted when the AuditTrail address is configured or updated.
    event AuditTrailUpdated(
        address indexed previousTrail,
        address indexed newTrail,
        address indexed updatedBy,
        uint64 timestamp
    );

    // ========================================================================
    //  CONSTRUCTOR
    // ========================================================================

    /**
     * @notice Initializes the EscalationManager with references to core contracts.
     * @param roleManagerAddress Deployed RoleManager address.
     * @param departmentManagerAddress Deployed DepartmentManager address.
     * @param grievanceSystemAddress Deployed GrievanceSystem address.
     */
    constructor(
        address roleManagerAddress,
        address departmentManagerAddress,
        address grievanceSystemAddress
    ) {
        if (
            roleManagerAddress == address(0) ||
            departmentManagerAddress == address(0) ||
            grievanceSystemAddress == address(0)
        ) {
            revert ZeroAddressNotAllowed();
        }

        roleManager = RoleManager(roleManagerAddress);
        departmentManager = DepartmentManager(departmentManagerAddress);
        grievanceSystem = GrievanceSystem(grievanceSystemAddress);
    }

    // ========================================================================
    //  ESCALATION LIFECYCLE
    // ========================================================================

    /**
     * @notice Triggers escalation for a grievance whose SLA deadline has been breached.
     * @dev Permissionless SLA-triggered execution: any interested party (citizen, officer,
     *      admin, or keeper bot) may trigger escalation once the SLA deadline has elapsed.
     *
     *      Enforces strict preconditions:
     *      1. Grievance must exist in GrievanceSystem.
     *      2. Grievance must currently be in Status.UNDER_INVESTIGATION.
     *      3. Grievance must not already be in Status.ESCALATED.
     *      4. Current block timestamp must strictly exceed the grievance's SLA deadline.
     *      5. Department must be operational and active in DepartmentManager.
     *
     * @param grievanceId The ID of the grievance to escalate.
     */
    function escalateGrievance(uint256 grievanceId) external {
        if (!grievanceSystem.grievanceExists(grievanceId)) {
            revert GrievanceNotFound(grievanceId);
        }

        Grievance memory g = grievanceSystem.getGrievance(grievanceId);

        // Disallow duplicate escalation
        if (g.status == Status.ESCALATED) {
            revert AlreadyEscalated(grievanceId);
        }

        // Only grievances actively under investigation can be escalated
        if (g.status != Status.UNDER_INVESTIGATION) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.ESCALATED);
        }

        // Validate SLA deadline breach
        if (block.timestamp <= g.slaDeadline) {
            revert SLANotBreached(grievanceId, g.slaDeadline, uint64(block.timestamp));
        }

        // Validate department is active
        if (!departmentManager.isDepartmentActive(g.departmentId)) {
            revert DepartmentNotActive(g.departmentId);
        }

        // Execute status transition on the authoritative GrievanceSystem
        grievanceSystem.setEscalatedStatus(grievanceId);

        // Record append-only escalation history
        uint64 now_ = uint64(block.timestamp);
        _grievanceEscalations[grievanceId].push(EscalationRecord({
            grievanceId: grievanceId,
            escalatedBy: msg.sender,
            escalatedAt: now_,
            resolvedBy: address(0),
            resolvedAt: 0
        }));

        emit GrievanceEscalated(grievanceId, msg.sender, g.departmentId, now_);

        if (auditTrail != address(0)) {
            AuditTrail(auditTrail).recordAudit(AuditAction.GRIEVANCE_ESCALATED, msg.sender, grievanceId, bytes32(0));
        }
    }

    /**
     * @notice Resolves an escalated grievance, returning it to UNDER_INVESTIGATION.
     * @dev Only callable by:
     *      1. Super Admin (global authority), OR
     *      2. Department Admin assigned to this specific grievance's department.
     *
     *      Strictly prevents cross-department administration.
     *      Preserves the assigned officer and all historical investigation data.
     *
     * @param grievanceId The ID of the escalated grievance to return to investigation.
     */
    function resolveEscalation(uint256 grievanceId) external {
        if (!grievanceSystem.grievanceExists(grievanceId)) {
            revert GrievanceNotFound(grievanceId);
        }

        Grievance memory g = grievanceSystem.getGrievance(grievanceId);

        if (g.status != Status.ESCALATED) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.UNDER_INVESTIGATION);
        }

        // Authorization check: Super Admin or assigned Department Admin
        bool isSuperAdmin_ = roleManager.isSuperAdmin(msg.sender);
        bool isAssignedDeptAdmin = (
            roleManager.isDepartmentAdmin(msg.sender) &&
            departmentManager.getDepartmentAdmin(g.departmentId) == msg.sender
        );

        if (!isSuperAdmin_ && !isAssignedDeptAdmin) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN or assigned DEPARTMENT_ADMIN");
        }

        // Execute status transition on the authoritative GrievanceSystem
        grievanceSystem.resolveEscalationStatus(grievanceId);

        // Update latest escalation record with resolver details
        uint64 now_ = uint64(block.timestamp);
        uint256 total = _grievanceEscalations[grievanceId].length;
        if (total > 0) {
            _grievanceEscalations[grievanceId][total - 1].resolvedBy = msg.sender;
            _grievanceEscalations[grievanceId][total - 1].resolvedAt = now_;
        }

        emit EscalationResolved(grievanceId, msg.sender, g.departmentId, now_);

        if (auditTrail != address(0)) {
            AuditTrail(auditTrail).recordAudit(AuditAction.STATUS_CHANGED, msg.sender, grievanceId, bytes32(uint256(Status.UNDER_INVESTIGATION)));
        }
    }

    // ========================================================================
    //  AUDIT CONFIGURATION
    // ========================================================================

    /**
     * @notice Configures the authorized AuditTrail contract.
     * @dev Only callable by Super Admin.
     * @param auditTrailAddress Address of the deployed AuditTrail.
     */
    function setAuditTrail(address auditTrailAddress) external {
        if (!roleManager.isSuperAdmin(msg.sender)) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN");
        }
        if (auditTrailAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        address previous = auditTrail;
        auditTrail = auditTrailAddress;
        emit AuditTrailUpdated(previous, auditTrailAddress, msg.sender, uint64(block.timestamp));
    }

    // ========================================================================
    //  VIEW FUNCTIONS — SLA & Escalation Status
    // ========================================================================

    /**
     * @notice Checks whether a grievance has breached its SLA deadline while under investigation.
     * @param grievanceId Grievance ID.
     * @return True if currently in UNDER_INVESTIGATION and block.timestamp > slaDeadline.
     */
    function isSLABreached(uint256 grievanceId) public view returns (bool) {
        if (!grievanceSystem.grievanceExists(grievanceId)) return false;
        Grievance memory g = grievanceSystem.getGrievance(grievanceId);
        if (g.status != Status.UNDER_INVESTIGATION) return false;
        return block.timestamp > g.slaDeadline;
    }

    /**
     * @notice Checks whether a grievance satisfies all conditions to be escalated.
     * @param grievanceId Grievance ID.
     * @return True if eligible for escalation right now.
     */
    function canEscalate(uint256 grievanceId) public view returns (bool) {
        if (!grievanceSystem.grievanceExists(grievanceId)) return false;
        Grievance memory g = grievanceSystem.getGrievance(grievanceId);
        if (g.status != Status.UNDER_INVESTIGATION) return false;
        if (block.timestamp <= g.slaDeadline) return false;
        if (!departmentManager.isDepartmentActive(g.departmentId)) return false;
        return true;
    }

    /**
     * @notice Checks whether a caller has authorization to resolve an escalation for a grievance.
     * @param grievanceId Grievance ID.
     * @param caller Address attempting resolution.
     * @return True if grievance is ESCALATED and caller is Super Admin or assigned Dept Admin.
     */
    function canResolveEscalation(uint256 grievanceId, address caller) public view returns (bool) {
        if (!grievanceSystem.grievanceExists(grievanceId)) return false;
        Grievance memory g = grievanceSystem.getGrievance(grievanceId);
        if (g.status != Status.ESCALATED) return false;
        if (caller == address(0)) return false;

        if (roleManager.isSuperAdmin(caller)) return true;
        if (
            roleManager.isDepartmentAdmin(caller) &&
            departmentManager.getDepartmentAdmin(g.departmentId) == caller
        ) {
            return true;
        }

        return false;
    }

    /**
     * @notice Checks whether a grievance is currently in ESCALATED status.
     * @param grievanceId Grievance ID.
     * @return True if status == Status.ESCALATED.
     */
    function isCurrentlyEscalated(uint256 grievanceId) external view returns (bool) {
        if (!grievanceSystem.grievanceExists(grievanceId)) return false;
        return grievanceSystem.getGrievance(grievanceId).status == Status.ESCALATED;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Escalation History
    // ========================================================================

    /**
     * @notice Returns the total number of times a grievance has been escalated.
     * @param grievanceId Grievance ID.
     * @return Number of escalation records.
     */
    function getEscalationCount(uint256 grievanceId) external view returns (uint256) {
        return _grievanceEscalations[grievanceId].length;
    }

    /**
     * @notice Returns a specific historical escalation record for a grievance.
     * @param grievanceId Grievance ID.
     * @param index Zero-based index within this grievance's escalation history.
     * @return The EscalationRecord struct.
     */
    function getEscalationRecord(
        uint256 grievanceId,
        uint256 index
    ) external view returns (EscalationRecord memory) {
        uint256 total = _grievanceEscalations[grievanceId].length;
        if (index >= total) {
            revert ValueOutOfRange("index", index, 0, total > 0 ? total - 1 : 0);
        }
        return _grievanceEscalations[grievanceId][index];
    }

    /**
     * @notice Returns the most recent escalation record for a grievance.
     * @param grievanceId Grievance ID.
     * @return The latest EscalationRecord struct.
     */
    function getLatestEscalationRecord(
        uint256 grievanceId
    ) external view returns (EscalationRecord memory) {
        uint256 total = _grievanceEscalations[grievanceId].length;
        if (total == 0) {
            revert ValueOutOfRange("total", 0, 1, type(uint256).max);
        }
        return _grievanceEscalations[grievanceId][total - 1];
    }

    /**
     * @notice Returns the complete list of historical escalation records for a grievance.
     * @param grievanceId Grievance ID.
     * @return Array of all EscalationRecord structs for this grievance.
     */
    function getAllEscalationRecords(
        uint256 grievanceId
    ) external view returns (EscalationRecord[] memory) {
        return _grievanceEscalations[grievanceId];
    }
}
