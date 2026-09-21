// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RoleManager} from "./RoleManager.sol";
import {DepartmentManager} from "./DepartmentManager.sol";
import {AuditTrail} from "./AuditTrail.sol";
import {
    Status,
    Priority,
    EvidenceType,
    ResolutionStatus,
    AuditAction,
    Grievance,
    Evidence,
    InvestigationNote,
    Assignment,
    Resolution,
    // Errors
    Unauthorized,
    ZeroAddressNotAllowed,
    GrievanceNotFound,
    InvalidStatusTransition,
    NotGrievanceOwner,
    InvalidTitle,
    CategoryNotFound,
    CategoryNotActive,
    DepartmentNotFound,
    DepartmentNotActive,
    OfficerNotInDepartment,
    NotAssignedOfficer,
    GrievanceAlreadyAssigned,
    EmptyIPFSCid,
    EmptyContentHash,
    EvidenceNotFound,
    ResolutionNotFound,
    ResolutionAlreadyPending,
    ValueOutOfRange
} from "./GrievanceTypes.sol";

/**
 * @title GrievanceSystem
 * @notice Central lifecycle and state management contract for the Blockchain-Based Public
 *         Grievance Tracking System.
 *
 * This contract is the authoritative source of truth for:
 *   1. Grievance intake and registration (Citizen submission -> Admin registration).
 *   2. Department and officer assignment with append-only assignment history.
 *   3. Controlled officer workflow: review -> investigation -> resolution proposal.
 *   4. Append-only investigation notes and dual-referenced (IPFS CID + Hash) evidence.
 *   5. Citizen feedback: accept, reject, and controlled reopening.
 *   6. Configurable SLA durations per priority tier.
 *
 * Authorization Architecture:
 *   - Strictly delegated to RoleManager (for global roles) and DepartmentManager
 *     (for department assignments and active status checks).
 *   - No arbitrary status mutation: status transitions are strictly governed by
 *     formal business functions matching the system lifecycle state machine.
 *
 * Immutability & Data Integrity:
 *   - Grievance, evidence, assignment, note, and resolution IDs are 1-indexed; ID 0 is reserved.
 *   - Historical records are NEVER deleted or overwritten.
 *   - Off-chain content uses the dual-reference pattern: IPFS CID for decentralized
 *     retrieval and bytes32 keccak256 hash for tamper-proof integrity verification.
 */
contract GrievanceSystem {

    // ========================================================================
    //  DEPENDENCIES
    // ========================================================================

    /// @notice Reference to the deployed RoleManager contract for role checks.
    RoleManager public immutable roleManager;

    /// @notice Reference to the deployed DepartmentManager for department & category checks.
    DepartmentManager public immutable departmentManager;

    /// @notice Authorized EscalationManager contract allowed to transition grievance escalation status.
    address public escalationManager;

    /// @notice Authorized AuditTrail contract.
    address public auditTrail;

    // ========================================================================
    //  STATE — Storage & Counters
    // ========================================================================

    /// @dev Next grievance ID to assign (starts at 1; ID 0 is reserved).
    uint256 private _nextGrievanceId = 1;

    /// @dev Primary grievance storage: grievanceId => Grievance struct.
    mapping(uint256 => Grievance) private _grievances;

    /// @dev Next assignment ID to assign (starts at 1).
    uint256 private _nextAssignmentId = 1;

    /// @dev Assignment history storage: assignmentId => Assignment struct.
    mapping(uint256 => Assignment) private _assignments;

    /// @dev Grievance to assignment IDs: grievanceId => array of assignment IDs.
    mapping(uint256 => uint256[]) private _grievanceAssignments;

    /// @dev Next investigation note ID to assign (starts at 1).
    uint256 private _nextNoteId = 1;

    /// @dev Investigation notes storage: noteId => InvestigationNote struct.
    mapping(uint256 => InvestigationNote) private _investigationNotes;

    /// @dev Grievance to note IDs: grievanceId => array of note IDs.
    mapping(uint256 => uint256[]) private _grievanceNotes;

    /// @dev Next evidence ID to assign (starts at 1).
    uint256 private _nextEvidenceId = 1;

    /// @dev Evidence storage: evidenceId => Evidence struct.
    mapping(uint256 => Evidence) private _evidences;

    /// @dev Grievance to evidence IDs: grievanceId => array of evidence IDs.
    mapping(uint256 => uint256[]) private _grievanceEvidences;

    /// @dev Next resolution ID to assign (starts at 1).
    uint256 private _nextResolutionId = 1;

    /// @dev Resolution storage: resolutionId => Resolution struct.
    mapping(uint256 => Resolution) private _resolutions;

    /// @dev Grievance to resolution IDs: grievanceId => array of resolution IDs.
    mapping(uint256 => uint256[]) private _grievanceResolutions;

    /// @dev SLA durations in seconds: Priority => duration in seconds.
    mapping(Priority => uint256) private _slaDurations;

    // ========================================================================
    //  CUSTOM ERRORS (Contract-Specific)
    // ========================================================================

    /// @notice Target officer is already assigned to this grievance.
    error CannotReassignToSameOfficer(uint256 grievanceId, address officer);

    /// @notice Attempted to revoke an evidence item that is already inactive/revoked.
    error EvidenceAlreadyRevoked(uint256 evidenceId);

    // ========================================================================
    //  EVENTS
    // ========================================================================

    /// @notice Emitted when a citizen creates a new grievance.
    event GrievanceCreated(
        uint256 indexed grievanceId,
        address indexed citizen,
        uint256 indexed departmentId,
        uint256 categoryId,
        Priority priority,
        uint64 slaDeadline,
        uint64 timestamp
    );

    /// @notice Emitted when an admin validates and registers intake of a grievance.
    event GrievanceRegistered(
        uint256 indexed grievanceId,
        address indexed actor,
        uint64 timestamp
    );

    /// @notice Emitted when an officer is assigned to a grievance.
    event GrievanceAssigned(
        uint256 indexed grievanceId,
        uint256 indexed assignmentId,
        uint256 indexed departmentId,
        address officer,
        address assignedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a grievance is reassigned to another officer.
    event GrievanceReassigned(
        uint256 indexed grievanceId,
        uint256 indexed assignmentId,
        uint256 indexed departmentId,
        address previousOfficer,
        address newOfficer,
        address reassignedBy,
        uint64 timestamp
    );

    /// @notice Emitted whenever a grievance transitions between statuses.
    event StatusChanged(
        uint256 indexed grievanceId,
        Status indexed previousStatus,
        Status indexed newStatus,
        address actor,
        uint64 timestamp
    );

    /// @notice Emitted when the assigned officer begins active investigation.
    event InvestigationStarted(
        uint256 indexed grievanceId,
        address indexed investigator,
        uint64 timestamp
    );

    /// @notice Emitted when an investigation note is appended.
    event InvestigationNoteAdded(
        uint256 indexed noteId,
        uint256 indexed grievanceId,
        address indexed investigator,
        string contentCid,
        bytes32 contentHash,
        uint64 timestamp
    );

    /// @notice Emitted when evidence metadata is attached to a grievance.
    event EvidenceAdded(
        uint256 indexed evidenceId,
        uint256 indexed grievanceId,
        address indexed submitter,
        EvidenceType evidenceType,
        string ipfsCid,
        bytes32 contentHash,
        uint64 timestamp
    );

    /// @notice Emitted when an evidence item is administratively revoked.
    event EvidenceRevoked(
        uint256 indexed evidenceId,
        uint256 indexed grievanceId,
        address indexed revokedBy,
        string reason,
        uint64 timestamp
    );

    /// @notice Emitted when the assigned officer submits a proposed resolution.
    event ResolutionSubmitted(
        uint256 indexed resolutionId,
        uint256 indexed grievanceId,
        address indexed proposedBy,
        string resolutionCid,
        bytes32 resolutionHash,
        uint64 timestamp
    );

    /// @notice Emitted when the citizen accepts the proposed resolution.
    event ResolutionAccepted(
        uint256 indexed resolutionId,
        uint256 indexed grievanceId,
        address indexed citizen,
        uint64 timestamp
    );

    /// @notice Emitted when the citizen rejects the proposed resolution.
    event ResolutionRejected(
        uint256 indexed resolutionId,
        uint256 indexed grievanceId,
        address indexed citizen,
        bytes32 rejectionReasonHash,
        uint64 timestamp
    );

    /// @notice Emitted when a citizen reopens a rejected grievance.
    event GrievanceReopened(
        uint256 indexed grievanceId,
        address indexed citizen,
        uint8 reopenCount,
        uint64 timestamp
    );

    /// @notice Emitted when a grievance is formally closed after acceptance.
    event GrievanceClosed(
        uint256 indexed grievanceId,
        address indexed closedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the Super Admin updates the SLA duration for a priority tier.
    event SLAUpdated(
        Priority indexed priority,
        uint256 oldDuration,
        uint256 newDuration,
        address indexed updatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the EscalationManager address is configured or updated.
    event EscalationManagerUpdated(
        address indexed previousManager,
        address indexed newManager,
        address indexed updatedBy,
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
    //  MODIFIERS
    // ========================================================================

    /// @dev Restricts access to Super Admin in RoleManager.
    modifier onlySuperAdmin() {
        if (!roleManager.isSuperAdmin(msg.sender)) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN");
        }
        _;
    }

    /// @dev Restricts access to Super Admin or the Department Admin assigned to the grievance's department.
    modifier onlySuperAdminOrDeptAdminFor(uint256 grievanceId) {
        _requireAdminForGrievance(grievanceId);
        _;
    }

    /// @dev Restricts access to the authorized EscalationManager contract.
    modifier onlyEscalationManager() {
        if (msg.sender != escalationManager) {
            revert Unauthorized(msg.sender, "ESCALATION_MANAGER");
        }
        _;
    }

    // ========================================================================
    //  CONSTRUCTOR
    // ========================================================================

    /**
     * @notice Initializes GrievanceSystem with references to RoleManager and DepartmentManager.
     * @param roleManagerAddress Deployed RoleManager address.
     * @param departmentManagerAddress Deployed DepartmentManager address.
     */
    constructor(address roleManagerAddress, address departmentManagerAddress) {
        if (roleManagerAddress == address(0) || departmentManagerAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        roleManager = RoleManager(roleManagerAddress);
        departmentManager = DepartmentManager(departmentManagerAddress);

        // Configure default SLA durations per priority tier
        _slaDurations[Priority.LOW] = 14 days;
        _slaDurations[Priority.MEDIUM] = 7 days;
        _slaDurations[Priority.HIGH] = 3 days;
        _slaDurations[Priority.CRITICAL] = 1 days;
    }

    // ========================================================================
    //  SLA CONFIGURATION
    // ========================================================================

    /**
     * @notice Updates the SLA duration for a priority tier.
     * @dev Only callable by Super Admin.
     * @param priority Target priority tier.
     * @param newDuration New duration in seconds (must be > 0).
     */
    function updateSlaDuration(Priority priority, uint256 newDuration) external onlySuperAdmin {
        if (newDuration == 0) {
            revert ValueOutOfRange("newDuration", 0, 1, type(uint256).max);
        }

        uint256 oldDuration = _slaDurations[priority];
        _slaDurations[priority] = newDuration;

        emit SLAUpdated(priority, oldDuration, newDuration, msg.sender, uint64(block.timestamp));
        _recordAudit(AuditAction.SLA_UPDATED, msg.sender, uint256(priority), bytes32(newDuration));
    }

    // ========================================================================
    //  GRIEVANCE CREATION
    // ========================================================================

    /**
     * @notice Submits a new grievance into the system.
     * @dev Only callable by a registered Citizen. Initial status is SUBMITTED.
     *
     * @param categoryId Category ID registered and active in DepartmentManager.
     * @param departmentId Department ID registered and active in DepartmentManager.
     * @param priority Priority tier for SLA deadline computation.
     * @param title Short summary title (1 to 200 bytes).
     * @param descriptionCid IPFS CID for full off-chain description.
     * @param descriptionHash keccak256 hash of description content for integrity verification.
     * @return grievanceId The assigned unique grievance identifier.
     */
    function createGrievance(
        uint256 categoryId,
        uint256 departmentId,
        Priority priority,
        string calldata title,
        string calldata descriptionCid,
        bytes32 descriptionHash
    ) external returns (uint256 grievanceId) {
        // Authorization check: caller must be a registered Citizen
        if (!roleManager.isCitizen(msg.sender)) {
            revert Unauthorized(msg.sender, "CITIZEN");
        }

        // Validate organizational entities
        if (!departmentManager.categoryExists(categoryId)) {
            revert CategoryNotFound(categoryId);
        }
        if (!departmentManager.isCategoryActive(categoryId)) {
            revert CategoryNotActive(categoryId);
        }
        if (!departmentManager.departmentExists(departmentId)) {
            revert DepartmentNotFound(departmentId);
        }
        if (!departmentManager.isDepartmentActive(departmentId)) {
            revert DepartmentNotActive(departmentId);
        }

        // Validate content
        if (bytes(title).length == 0 || bytes(title).length > 200) {
            revert InvalidTitle();
        }
        if (bytes(descriptionCid).length == 0) {
            revert EmptyIPFSCid();
        }
        if (descriptionHash == bytes32(0)) {
            revert EmptyContentHash();
        }

        grievanceId = _nextGrievanceId++;
        uint64 now_ = uint64(block.timestamp);
        uint64 deadline = now_ + uint64(_slaDurations[priority]);

        Grievance storage g = _grievances[grievanceId];
        g.id = grievanceId;
        g.citizen = msg.sender;
        g.status = Status.SUBMITTED;
        g.priority = priority;
        g.reopenCount = 0;
        g.assignedOfficer = address(0);
        g.departmentId = departmentId;
        g.categoryId = categoryId;
        g.title = title;
        g.descriptionCid = descriptionCid;
        g.descriptionHash = descriptionHash;
        g.createdAt = now_;
        g.updatedAt = now_;
        g.slaDeadline = deadline;
        g.currentResolutionId = 0;

        emit GrievanceCreated(
            grievanceId,
            msg.sender,
            departmentId,
            categoryId,
            priority,
            deadline,
            now_
        );

        emit StatusChanged(
            grievanceId,
            Status.SUBMITTED,
            Status.SUBMITTED,
            msg.sender,
            now_
        );

        _recordAudit(AuditAction.GRIEVANCE_CREATED, msg.sender, grievanceId, descriptionHash);
    }

    // ========================================================================
    //  GRIEVANCE REGISTRATION & ASSIGNMENT
    // ========================================================================

    /**
     * @notice Registers intake for a submitted grievance (SUBMITTED -> REGISTERED).
     * @dev Callable by Super Admin or the Department Admin assigned to the grievance's department.
     * @param grievanceId Grievance ID to register.
     */
    function registerGrievance(uint256 grievanceId) external onlySuperAdminOrDeptAdminFor(grievanceId) {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.SUBMITTED) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.REGISTERED);
        }

        _transitionStatus(grievanceId, Status.REGISTERED);
        emit GrievanceRegistered(grievanceId, msg.sender, uint64(block.timestamp));
        _recordAudit(AuditAction.GRIEVANCE_REGISTERED, msg.sender, grievanceId, bytes32(0));
    }

    /**
     * @notice Assigns an officer to a grievance (REGISTERED or REOPENED -> ASSIGNED).
     * @dev Callable by Super Admin or the Department Admin assigned to the grievance's department.
     *      Officer must belong to this specific grievance's department in DepartmentManager.
     *
     * @param grievanceId Grievance ID to assign.
     * @param officer Address of the officer to assign.
     */
    function assignOfficer(
        uint256 grievanceId,
        address officer
    ) external onlySuperAdminOrDeptAdminFor(grievanceId) {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        // Ensure grievance is in an assignable state
        if (g.status != Status.REGISTERED && g.status != Status.REOPENED) {
            if (g.status == Status.ASSIGNED) {
                revert GrievanceAlreadyAssigned(grievanceId);
            }
            revert InvalidStatusTransition(grievanceId, g.status, Status.ASSIGNED);
        }

        _validateOfficerForDepartment(g.departmentId, officer);

        // Record assignment
        uint256 assignmentId = _recordAssignment(grievanceId, g.departmentId, officer);
        g.assignedOfficer = officer;

        _transitionStatus(grievanceId, Status.ASSIGNED);

        emit GrievanceAssigned(
            grievanceId,
            assignmentId,
            g.departmentId,
            officer,
            msg.sender,
            uint64(block.timestamp)
        );

        _recordAudit(AuditAction.GRIEVANCE_ASSIGNED, msg.sender, grievanceId, bytes32(uint256(uint160(officer))));
    }

    /**
     * @notice Reassigns a grievance to a different officer.
     * @dev Callable by Super Admin or assigned Department Admin during active handling.
     *
     * @param grievanceId Grievance ID to reassign.
     * @param newOfficer Address of the new officer.
     */
    function reassignOfficer(
        uint256 grievanceId,
        address newOfficer
    ) external onlySuperAdminOrDeptAdminFor(grievanceId) {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        // Must already be assigned or in investigation
        if (
            g.status != Status.ASSIGNED &&
            g.status != Status.UNDER_REVIEW &&
            g.status != Status.UNDER_INVESTIGATION &&
            g.status != Status.ESCALATED
        ) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.ASSIGNED);
        }

        if (newOfficer == g.assignedOfficer) {
            revert CannotReassignToSameOfficer(grievanceId, newOfficer);
        }

        _validateOfficerForDepartment(g.departmentId, newOfficer);

        address previousOfficer = g.assignedOfficer;
        uint256 assignmentId = _recordAssignment(grievanceId, g.departmentId, newOfficer);
        g.assignedOfficer = newOfficer;

        // If escalated or under investigation, keep or reset to ASSIGNED/UNDER_INVESTIGATION
        if (g.status == Status.ESCALATED) {
            _transitionStatus(grievanceId, Status.UNDER_INVESTIGATION);
        }

        emit GrievanceReassigned(
            grievanceId,
            assignmentId,
            g.departmentId,
            previousOfficer,
            newOfficer,
            msg.sender,
            uint64(block.timestamp)
        );

        _recordAudit(AuditAction.GRIEVANCE_REASSIGNED, msg.sender, grievanceId, bytes32(uint256(uint160(newOfficer))));
    }

    // ========================================================================
    //  OFFICER WORKFLOW
    // ========================================================================

    /**
     * @notice Starts review of an assigned grievance (ASSIGNED -> UNDER_REVIEW).
     * @dev Only callable by the currently assigned officer.
     * @param grievanceId Grievance ID.
     */
    function startReview(uint256 grievanceId) external {
        _requireAssignedOfficer(grievanceId);
        _transitionStatus(grievanceId, Status.UNDER_REVIEW);
    }

    /**
     * @notice Starts formal investigation (UNDER_REVIEW -> UNDER_INVESTIGATION).
     * @dev Only callable by the currently assigned officer.
     * @param grievanceId Grievance ID.
     */
    function startInvestigation(uint256 grievanceId) external {
        _requireAssignedOfficer(grievanceId);
        _transitionStatus(grievanceId, Status.UNDER_INVESTIGATION);
        emit InvestigationStarted(grievanceId, msg.sender, uint64(block.timestamp));
        _recordAudit(AuditAction.INVESTIGATION_STARTED, msg.sender, grievanceId, bytes32(0));
    }

    /**
     * @notice Appends an investigation note to a grievance under review/investigation.
     * @dev Only callable by the currently assigned officer. Append-only.
     *
     * @param grievanceId Grievance ID.
     * @param contentCid IPFS CID of note text.
     * @param contentHash keccak256 hash of note text.
     * @return noteId Unique identifier of the created investigation note.
     */
    function addInvestigationNote(
        uint256 grievanceId,
        string calldata contentCid,
        bytes32 contentHash
    ) external returns (uint256 noteId) {
        _requireAssignedOfficer(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.UNDER_REVIEW && g.status != Status.UNDER_INVESTIGATION) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.UNDER_INVESTIGATION);
        }
        if (bytes(contentCid).length == 0) revert EmptyIPFSCid();
        if (contentHash == bytes32(0)) revert EmptyContentHash();

        noteId = _nextNoteId++;
        uint64 now_ = uint64(block.timestamp);

        _investigationNotes[noteId] = InvestigationNote({
            id: noteId,
            grievanceId: grievanceId,
            investigator: msg.sender,
            contentCid: contentCid,
            contentHash: contentHash,
            timestamp: now_
        });

        _grievanceNotes[grievanceId].push(noteId);
        g.updatedAt = now_;

        emit InvestigationNoteAdded(
            noteId,
            grievanceId,
            msg.sender,
            contentCid,
            contentHash,
            now_
        );

        _recordAudit(AuditAction.INVESTIGATION_NOTE_ADDED, msg.sender, grievanceId, contentHash);
    }

    // ========================================================================
    //  EVIDENCE MANAGEMENT
    // ========================================================================

    /**
     * @notice Attaches evidence metadata to a grievance.
     * @dev Callable by the grievance's citizen, assigned officer, or authorized admins.
     *      Grievance must not be CLOSED.
     *
     * @param grievanceId Grievance ID.
     * @param evidenceType Classification enum.
     * @param ipfsCid IPFS CID for file retrieval.
     * @param contentHash keccak256 hash of the evidence file.
     * @return evidenceId Unique identifier of the attached evidence.
     */
    function addEvidence(
        uint256 grievanceId,
        EvidenceType evidenceType,
        string calldata ipfsCid,
        bytes32 contentHash
    ) external returns (uint256 evidenceId) {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status == Status.CLOSED) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.CLOSED);
        }
        if (bytes(ipfsCid).length == 0) revert EmptyIPFSCid();
        if (contentHash == bytes32(0)) revert EmptyContentHash();

        // Authorization: citizen, assigned officer, super admin, or dept admin for this dept
        bool isCitizenOwner = (msg.sender == g.citizen);
        bool isOfficerOwner = (msg.sender == g.assignedOfficer && roleManager.isOfficer(msg.sender));
        bool isSuperAdmin_ = roleManager.isSuperAdmin(msg.sender);
        bool isDeptAdmin_ = (
            roleManager.isDepartmentAdmin(msg.sender) &&
            departmentManager.getDepartmentAdmin(g.departmentId) == msg.sender
        );

        if (!isCitizenOwner && !isOfficerOwner && !isSuperAdmin_ && !isDeptAdmin_) {
            revert Unauthorized(msg.sender, "Citizen, Assigned Officer, or Department/Super Admin");
        }

        evidenceId = _nextEvidenceId++;
        uint64 now_ = uint64(block.timestamp);

        _evidences[evidenceId] = Evidence({
            id: evidenceId,
            grievanceId: grievanceId,
            submitter: msg.sender,
            evidenceType: evidenceType,
            isActive: true,
            ipfsCid: ipfsCid,
            contentHash: contentHash,
            submittedAt: now_
        });

        _grievanceEvidences[grievanceId].push(evidenceId);
        g.updatedAt = now_;

        emit EvidenceAdded(
            evidenceId,
            grievanceId,
            msg.sender,
            evidenceType,
            ipfsCid,
            contentHash,
            now_
        );

        _recordAudit(AuditAction.EVIDENCE_ADDED, msg.sender, grievanceId, contentHash);
    }

    /**
     * @notice Administratively revokes validity of an evidence record.
     * @dev Callable by Super Admin or assigned Department Admin. Does NOT delete data.
     *
     * @param evidenceId Evidence ID to revoke.
     * @param reason Human-readable audit explanation.
     */
    function revokeEvidence(
        uint256 evidenceId,
        string calldata reason
    ) external {
        if (evidenceId == 0 || evidenceId >= _nextEvidenceId) {
            revert EvidenceNotFound(evidenceId);
        }

        Evidence storage ev = _evidences[evidenceId];
        if (!ev.isActive) {
            revert EvidenceAlreadyRevoked(evidenceId);
        }

        _requireAdminForGrievance(ev.grievanceId);

        ev.isActive = false;
        emit EvidenceRevoked(evidenceId, ev.grievanceId, msg.sender, reason, uint64(block.timestamp));
        _recordAudit(AuditAction.EVIDENCE_REVOKED, msg.sender, ev.grievanceId, keccak256(bytes(reason)));
    }

    // ========================================================================
    //  RESOLUTION LIFECYCLE
    // ========================================================================

    /**
     * @notice Submits a resolution proposal (UNDER_INVESTIGATION -> RESOLUTION_PROPOSED -> CITIZEN_REVIEW).
     * @dev Only callable by the currently assigned officer.
     *
     * @param grievanceId Grievance ID.
     * @param resolutionCid IPFS CID describing the proposed resolution.
     * @param resolutionHash keccak256 hash of the resolution content.
     * @return resolutionId Unique identifier of the proposed resolution.
     */
    function submitResolution(
        uint256 grievanceId,
        string calldata resolutionCid,
        bytes32 resolutionHash
    ) external returns (uint256 resolutionId) {
        _requireAssignedOfficer(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.UNDER_INVESTIGATION) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.RESOLUTION_PROPOSED);
        }

        if (g.currentResolutionId != 0 && _resolutions[g.currentResolutionId].status == ResolutionStatus.PENDING) {
            revert ResolutionAlreadyPending(grievanceId);
        }

        if (bytes(resolutionCid).length == 0) revert EmptyIPFSCid();
        if (resolutionHash == bytes32(0)) revert EmptyContentHash();

        resolutionId = _nextResolutionId++;
        uint64 now_ = uint64(block.timestamp);

        _resolutions[resolutionId] = Resolution({
            id: resolutionId,
            grievanceId: grievanceId,
            proposedBy: msg.sender,
            status: ResolutionStatus.PENDING,
            resolutionCid: resolutionCid,
            resolutionHash: resolutionHash,
            rejectionReasonHash: bytes32(0),
            proposedAt: now_,
            reviewedAt: 0
        });

        _grievanceResolutions[grievanceId].push(resolutionId);
        g.currentResolutionId = resolutionId;

        // Transition through formal resolution proposed to citizen review
        _transitionStatus(grievanceId, Status.RESOLUTION_PROPOSED);
        _transitionStatus(grievanceId, Status.CITIZEN_REVIEW);

        emit ResolutionSubmitted(
            resolutionId,
            grievanceId,
            msg.sender,
            resolutionCid,
            resolutionHash,
            now_
        );

        _recordAudit(AuditAction.RESOLUTION_SUBMITTED, msg.sender, grievanceId, resolutionHash);
    }

    /**
     * @notice Citizen accepts the proposed resolution (CITIZEN_REVIEW -> ACCEPTED).
     * @dev Only callable by the citizen who submitted this grievance.
     * @param grievanceId Grievance ID.
     */
    function acceptResolution(uint256 grievanceId) external {
        _requireGrievanceOwner(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.CITIZEN_REVIEW) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.ACCEPTED);
        }

        uint256 resId = g.currentResolutionId;
        if (resId == 0 || _resolutions[resId].status != ResolutionStatus.PENDING) {
            revert ResolutionNotFound(resId);
        }

        uint64 now_ = uint64(block.timestamp);
        _resolutions[resId].status = ResolutionStatus.ACCEPTED;
        _resolutions[resId].reviewedAt = now_;

        _transitionStatus(grievanceId, Status.ACCEPTED);

        emit ResolutionAccepted(resId, grievanceId, msg.sender, now_);
        _recordAudit(AuditAction.RESOLUTION_ACCEPTED, msg.sender, grievanceId, bytes32(0));
    }

    /**
     * @notice Citizen rejects the proposed resolution (CITIZEN_REVIEW -> REJECTED).
     * @dev Only callable by the citizen who submitted this grievance.
     *
     * @param grievanceId Grievance ID.
     * @param rejectionReasonHash keccak256 hash of the rejection rationale.
     */
    function rejectResolution(uint256 grievanceId, bytes32 rejectionReasonHash) external {
        _requireGrievanceOwner(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.CITIZEN_REVIEW) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.REJECTED);
        }
        if (rejectionReasonHash == bytes32(0)) {
            revert EmptyContentHash();
        }

        uint256 resId = g.currentResolutionId;
        if (resId == 0 || _resolutions[resId].status != ResolutionStatus.PENDING) {
            revert ResolutionNotFound(resId);
        }

        uint64 now_ = uint64(block.timestamp);
        _resolutions[resId].status = ResolutionStatus.REJECTED;
        _resolutions[resId].rejectionReasonHash = rejectionReasonHash;
        _resolutions[resId].reviewedAt = now_;

        _transitionStatus(grievanceId, Status.REJECTED);

        emit ResolutionRejected(resId, grievanceId, msg.sender, rejectionReasonHash, now_);
        _recordAudit(AuditAction.RESOLUTION_REJECTED, msg.sender, grievanceId, rejectionReasonHash);
    }

    /**
     * @notice Reopens a grievance after rejection (REJECTED -> REOPENED).
     * @dev Only callable by the citizen who filed the grievance.
     *      Increments reopenCount and enables reassignment.
     *
     * @param grievanceId Grievance ID.
     */
    function reopenGrievance(uint256 grievanceId) external {
        _requireGrievanceOwner(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.REJECTED) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.REOPENED);
        }

        if (g.reopenCount == type(uint8).max) {
            revert ValueOutOfRange("reopenCount", g.reopenCount, 0, type(uint8).max - 1);
        }

        g.reopenCount++;
        _transitionStatus(grievanceId, Status.REOPENED);

        emit GrievanceReopened(grievanceId, msg.sender, g.reopenCount, uint64(block.timestamp));
        _recordAudit(AuditAction.GRIEVANCE_REOPENED, msg.sender, grievanceId, bytes32(uint256(g.reopenCount)));
    }

    /**
     * @notice Formally closes an accepted grievance (ACCEPTED -> CLOSED).
     * @dev Callable by the citizen owner, Super Admin, or assigned Department Admin.
     * @param grievanceId Grievance ID.
     */
    function closeGrievance(uint256 grievanceId) external {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (g.status != Status.ACCEPTED) {
            revert InvalidStatusTransition(grievanceId, g.status, Status.CLOSED);
        }

        bool isCitizenOwner = (msg.sender == g.citizen);
        bool isSuperAdmin_ = roleManager.isSuperAdmin(msg.sender);
        bool isDeptAdmin_ = (
            roleManager.isDepartmentAdmin(msg.sender) &&
            departmentManager.getDepartmentAdmin(g.departmentId) == msg.sender
        );

        if (!isCitizenOwner && !isSuperAdmin_ && !isDeptAdmin_) {
            revert Unauthorized(msg.sender, "Citizen or Admin");
        }

        _transitionStatus(grievanceId, Status.CLOSED);
        emit GrievanceClosed(grievanceId, msg.sender, uint64(block.timestamp));
        _recordAudit(AuditAction.GRIEVANCE_CLOSED, msg.sender, grievanceId, bytes32(0));
    }

    // ========================================================================
    //  ESCALATION HOOKS (Authorized EscalationManager Only)
    // ========================================================================

    /**
     * @notice Configures the authorized EscalationManager contract.
     * @dev Only callable by Super Admin.
     * @param escalationManagerAddress Address of the deployed EscalationManager.
     */
    function setEscalationManager(address escalationManagerAddress) external onlySuperAdmin {
        if (escalationManagerAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        address previous = escalationManager;
        escalationManager = escalationManagerAddress;
        emit EscalationManagerUpdated(previous, escalationManagerAddress, msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Transitions a grievance to ESCALATED status upon verified SLA breach.
     * @dev Only callable by the authorized EscalationManager contract.
     * @param grievanceId The grievance ID to escalate.
     */
    function setEscalatedStatus(uint256 grievanceId) external onlyEscalationManager {
        _requireGrievanceExists(grievanceId);
        _transitionStatus(grievanceId, Status.ESCALATED);
    }

    /**
     * @notice Transitions an escalated grievance back to UNDER_INVESTIGATION status upon resolution.
     * @dev Only callable by the authorized EscalationManager contract.
     * @param grievanceId The grievance ID being returned to investigation.
     */
    function resolveEscalationStatus(uint256 grievanceId) external onlyEscalationManager {
        _requireGrievanceExists(grievanceId);
        _transitionStatus(grievanceId, Status.UNDER_INVESTIGATION);
    }

    // ========================================================================
    //  AUDIT HOOKS (Optional Authorized AuditTrail Integration)
    // ========================================================================

    /**
     * @notice Configures the authorized AuditTrail contract.
     * @dev Only callable by Super Admin.
     * @param auditTrailAddress Address of the deployed AuditTrail.
     */
    function setAuditTrail(address auditTrailAddress) external onlySuperAdmin {
        if (auditTrailAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        address previous = auditTrail;
        auditTrail = auditTrailAddress;
        emit AuditTrailUpdated(previous, auditTrailAddress, msg.sender, uint64(block.timestamp));
    }

    /**
     * @dev Internal helper that safely writes an audit record if AuditTrail is configured.
     */
    function _recordAudit(
        AuditAction action,
        address actor,
        uint256 targetId,
        bytes32 detailsHash
    ) internal {
        address at = auditTrail;
        if (at != address(0)) {
            AuditTrail(at).recordAudit(action, actor, targetId, detailsHash);
        }
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Grievances
    // ========================================================================

    /**
     * @notice Returns the full Grievance record.
     * @param grievanceId Grievance ID.
     * @return Grievance struct.
     */
    function getGrievance(uint256 grievanceId) external view returns (Grievance memory) {
        _requireGrievanceExists(grievanceId);
        return _grievances[grievanceId];
    }

    /**
     * @notice Checks whether a grievance exists.
     * @param grievanceId Grievance ID.
     * @return True if grievance exists.
     */
    function grievanceExists(uint256 grievanceId) external view returns (bool) {
        return _grievanceExists(grievanceId);
    }

    /**
     * @notice Returns total grievances created.
     * @return Total count.
     */
    function getGrievanceCount() external view returns (uint256) {
        return _nextGrievanceId - 1;
    }

    /**
     * @notice Returns the SLA duration for a priority tier.
     * @param priority Priority enum.
     * @return Duration in seconds.
     */
    function getSlaDuration(Priority priority) external view returns (uint256) {
        return _slaDurations[priority];
    }

    /**
     * @notice Returns the SLA deadline timestamp for a grievance.
     * @param grievanceId Grievance ID.
     * @return SLA deadline timestamp.
     */
    function getSlaDeadline(uint256 grievanceId) external view returns (uint64) {
        _requireGrievanceExists(grievanceId);
        return _grievances[grievanceId].slaDeadline;
    }

    /**
     * @notice Checks if an account is the citizen owner of a grievance.
     * @param grievanceId Grievance ID.
     * @param account Account address.
     * @return True if owner.
     */
    function isGrievanceOwner(uint256 grievanceId, address account) external view returns (bool) {
        if (!_grievanceExists(grievanceId)) return false;
        return _grievances[grievanceId].citizen == account;
    }

    /**
     * @notice Checks if an account is the assigned officer of a grievance.
     * @param grievanceId Grievance ID.
     * @param account Account address.
     * @return True if assigned officer.
     */
    function isAssignedOfficer(uint256 grievanceId, address account) external view returns (bool) {
        if (!_grievanceExists(grievanceId)) return false;
        return _grievances[grievanceId].assignedOfficer == account && account != address(0);
    }

    /**
     * @notice Checks if a grievance has exceeded its SLA deadline.
     * @param grievanceId Grievance ID.
     * @return True if past deadline and not yet closed/accepted.
     */
    function isGrievanceOverdue(uint256 grievanceId) external view returns (bool) {
        if (!_grievanceExists(grievanceId)) return false;
        Grievance storage g = _grievances[grievanceId];
        if (g.status == Status.CLOSED || g.status == Status.ACCEPTED) return false;
        return block.timestamp > g.slaDeadline;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Assignments
    // ========================================================================

    /**
     * @notice Returns all assignment IDs associated with a grievance.
     * @param grievanceId Grievance ID.
     * @return Array of assignment IDs.
     */
    function getGrievanceAssignments(uint256 grievanceId) external view returns (uint256[] memory) {
        _requireGrievanceExists(grievanceId);
        return _grievanceAssignments[grievanceId];
    }

    /**
     * @notice Returns an Assignment record.
     * @param assignmentId Assignment ID.
     * @return Assignment struct.
     */
    function getAssignment(uint256 assignmentId) external view returns (Assignment memory) {
        if (assignmentId == 0 || assignmentId >= _nextAssignmentId) {
            revert ValueOutOfRange("assignmentId", assignmentId, 1, _nextAssignmentId - 1);
        }
        return _assignments[assignmentId];
    }

    /**
     * @notice Returns total assignments recorded.
     * @return Total count.
     */
    function getAssignmentCount() external view returns (uint256) {
        return _nextAssignmentId - 1;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Investigation Notes
    // ========================================================================

    /**
     * @notice Returns all note IDs associated with a grievance.
     * @param grievanceId Grievance ID.
     * @return Array of note IDs.
     */
    function getGrievanceInvestigationNotes(uint256 grievanceId) external view returns (uint256[] memory) {
        _requireGrievanceExists(grievanceId);
        return _grievanceNotes[grievanceId];
    }

    /**
     * @notice Returns an InvestigationNote record.
     * @param noteId Note ID.
     * @return InvestigationNote struct.
     */
    function getInvestigationNote(uint256 noteId) external view returns (InvestigationNote memory) {
        if (noteId == 0 || noteId >= _nextNoteId) {
            revert ValueOutOfRange("noteId", noteId, 1, _nextNoteId - 1);
        }
        return _investigationNotes[noteId];
    }

    /**
     * @notice Returns total notes recorded.
     * @return Total count.
     */
    function getInvestigationNoteCount() external view returns (uint256) {
        return _nextNoteId - 1;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Evidence
    // ========================================================================

    /**
     * @notice Returns all evidence IDs associated with a grievance.
     * @param grievanceId Grievance ID.
     * @return Array of evidence IDs.
     */
    function getGrievanceEvidence(uint256 grievanceId) external view returns (uint256[] memory) {
        _requireGrievanceExists(grievanceId);
        return _grievanceEvidences[grievanceId];
    }

    /**
     * @notice Returns an Evidence record.
     * @param evidenceId Evidence ID.
     * @return Evidence struct.
     */
    function getEvidence(uint256 evidenceId) external view returns (Evidence memory) {
        if (evidenceId == 0 || evidenceId >= _nextEvidenceId) {
            revert EvidenceNotFound(evidenceId);
        }
        return _evidences[evidenceId];
    }

    /**
     * @notice Returns total evidence records created.
     * @return Total count.
     */
    function getEvidenceCount() external view returns (uint256) {
        return _nextEvidenceId - 1;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Resolutions
    // ========================================================================

    /**
     * @notice Returns all resolution IDs associated with a grievance.
     * @param grievanceId Grievance ID.
     * @return Array of resolution IDs.
     */
    function getGrievanceResolutions(uint256 grievanceId) external view returns (uint256[] memory) {
        _requireGrievanceExists(grievanceId);
        return _grievanceResolutions[grievanceId];
    }

    /**
     * @notice Returns a Resolution record.
     * @param resolutionId Resolution ID.
     * @return Resolution struct.
     */
    function getResolution(uint256 resolutionId) external view returns (Resolution memory) {
        if (resolutionId == 0 || resolutionId >= _nextResolutionId) {
            revert ResolutionNotFound(resolutionId);
        }
        return _resolutions[resolutionId];
    }

    /**
     * @notice Returns total resolutions created.
     * @return Total count.
     */
    function getResolutionCount() external view returns (uint256) {
        return _nextResolutionId - 1;
    }

    // ========================================================================
    //  INTERNAL HELPERS — Validation & Transition
    // ========================================================================

    /// @dev Checks existence of a grievance ID within bounds.
    function _grievanceExists(uint256 grievanceId) internal view returns (bool) {
        return grievanceId >= 1 && grievanceId < _nextGrievanceId;
    }

    /// @dev Reverts if grievance does not exist.
    function _requireGrievanceExists(uint256 grievanceId) internal view {
        if (!_grievanceExists(grievanceId)) {
            revert GrievanceNotFound(grievanceId);
        }
    }

    /// @dev Reverts if caller is not the citizen who filed the grievance.
    function _requireGrievanceOwner(uint256 grievanceId) internal view {
        _requireGrievanceExists(grievanceId);
        if (_grievances[grievanceId].citizen != msg.sender) {
            revert NotGrievanceOwner(grievanceId, msg.sender);
        }
    }

    /// @dev Reverts if caller is not the currently assigned officer holding OFFICER_ROLE.
    function _requireAssignedOfficer(uint256 grievanceId) internal view {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (!roleManager.isOfficer(msg.sender) || g.assignedOfficer != msg.sender) {
            revert NotAssignedOfficer(grievanceId, msg.sender);
        }
    }

    /// @dev Reverts if caller is neither Super Admin nor assigned Department Admin for this grievance's dept.
    function _requireAdminForGrievance(uint256 grievanceId) internal view {
        _requireGrievanceExists(grievanceId);
        Grievance storage g = _grievances[grievanceId];

        if (!roleManager.isSuperAdmin(msg.sender)) {
            bool isAssignedDeptAdmin = (
                roleManager.isDepartmentAdmin(msg.sender) &&
                departmentManager.getDepartmentAdmin(g.departmentId) == msg.sender
            );
            if (!isAssignedDeptAdmin) {
                revert Unauthorized(msg.sender, "SUPER_ADMIN or assigned DEPARTMENT_ADMIN");
            }
        }
    }

    /// @dev Validates that an officer exists, is nonzero, holds OFFICER_ROLE, and belongs to the department.
    function _validateOfficerForDepartment(uint256 departmentId, address officer) internal view {
        if (officer == address(0)) revert ZeroAddressNotAllowed();
        if (!departmentManager.isDepartmentActive(departmentId)) revert DepartmentNotActive(departmentId);
        if (!roleManager.isOfficer(officer)) revert Unauthorized(officer, "OFFICER");
        if (!departmentManager.isOfficerInDepartment(departmentId, officer)) {
            revert OfficerNotInDepartment(officer, departmentId);
        }
    }

    /// @dev Creates an immutable Assignment record and links it to the grievance.
    function _recordAssignment(
        uint256 grievanceId,
        uint256 departmentId,
        address officer
    ) internal returns (uint256 assignmentId) {
        assignmentId = _nextAssignmentId++;
        uint64 now_ = uint64(block.timestamp);

        _assignments[assignmentId] = Assignment({
            grievanceId: grievanceId,
            departmentId: departmentId,
            assignedOfficer: officer,
            assignedBy: msg.sender,
            assignedAt: now_
        });

        _grievanceAssignments[grievanceId].push(assignmentId);
    }

    /**
     * @dev Validates whether a lifecycle status transition is permitted.
     */
    function _isValidTransition(Status from, Status to) internal pure returns (bool) {
        if (from == Status.SUBMITTED && to == Status.REGISTERED) return true;
        if (from == Status.REGISTERED && to == Status.ASSIGNED) return true;
        if (from == Status.REOPENED && to == Status.ASSIGNED) return true;
        if (from == Status.ASSIGNED && to == Status.UNDER_REVIEW) return true;
        if (from == Status.UNDER_REVIEW && to == Status.UNDER_INVESTIGATION) return true;
        if (from == Status.UNDER_INVESTIGATION && to == Status.RESOLUTION_PROPOSED) return true;
        if (from == Status.RESOLUTION_PROPOSED && to == Status.CITIZEN_REVIEW) return true;
        if (from == Status.CITIZEN_REVIEW && to == Status.ACCEPTED) return true;
        if (from == Status.CITIZEN_REVIEW && to == Status.REJECTED) return true;
        if (from == Status.REJECTED && to == Status.REOPENED) return true;
        if (from == Status.ACCEPTED && to == Status.CLOSED) return true;
        // Escalation hooks reserved for future EscalationManager
        if (from == Status.UNDER_INVESTIGATION && to == Status.ESCALATED) return true;
        if (from == Status.ESCALATED && to == Status.UNDER_INVESTIGATION) return true;
        if (from == Status.ESCALATED && to == Status.ASSIGNED) return true;

        return false;
    }

    /**
     * @dev Executes an authorized status transition, updates timestamp, and emits event.
     */
    function _transitionStatus(uint256 grievanceId, Status newStatus) internal {
        Grievance storage g = _grievances[grievanceId];
        Status oldStatus = g.status;

        if (!_isValidTransition(oldStatus, newStatus)) {
            revert InvalidStatusTransition(grievanceId, oldStatus, newStatus);
        }

        g.status = newStatus;
        g.updatedAt = uint64(block.timestamp);

        emit StatusChanged(grievanceId, oldStatus, newStatus, msg.sender, g.updatedAt);
    }
}
