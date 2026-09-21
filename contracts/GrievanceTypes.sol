// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GrievanceTypes
 * @notice Foundational type definitions for the Blockchain-Based Public Grievance Tracking System.
 *
 * This file defines all shared enums, structs, and custom errors used across the grievance
 * management contract suite. It contains NO business logic — only reusable data types and
 * error definitions.
 *
 * Architecture notes:
 * - File-level definitions allow selective imports: `import { Status, Grievance } from "./GrievanceTypes.sol";`
 * - Enums enforce named state transitions; consuming contracts must never rely on raw integer values.
 * - Structs are designed for append-only historical records where immutability matters
 *   (e.g., InvestigationNote, Assignment) and mutable state where necessary (e.g., Grievance.status).
 * - Large text content (descriptions, resolution details, investigation notes) is stored off-chain
 *   and referenced on-chain via an IPFS CID (for retrieval) and a bytes32 content hash (for
 *   integrity verification). This dual-reference pattern keeps gas costs practical while enabling
 *   a fully backend-free DApp.
 * - Evidence files are NEVER stored on-chain; only IPFS CIDs and content hashes are recorded.
 * - Grievance categories are NOT an enum. They use a dynamic `uint256 categoryId` referencing a
 *   category registry managed by a future contract. This allows the Super Admin to create,
 *   activate, and deactivate categories at runtime without redeploying contracts.
 */

// ============================================================================
//  ENUMS
// ============================================================================

/**
 * @notice Grievance lifecycle status.
 * @dev Transitions are enforced by GrievanceSystem.sol — not by this type definition.
 *
 * Lifecycle flow:
 *   SUBMITTED → REGISTERED → ASSIGNED → UNDER_REVIEW → UNDER_INVESTIGATION
 *   → RESOLUTION_PROPOSED → CITIZEN_REVIEW → ACCEPTED → CLOSED
 *
 * Rejection path:
 *   CITIZEN_REVIEW → REJECTED → REOPENED → ASSIGNED → ...
 *
 * Escalation path:
 *   UNDER_INVESTIGATION → ESCALATED → UNDER_INVESTIGATION
 */
enum Status {
    SUBMITTED,              // 0 — Citizen has submitted the grievance
    REGISTERED,             // 1 — Department has validated and registered intake
    ASSIGNED,               // 2 — Department Admin has assigned to an Officer
    UNDER_REVIEW,           // 3 — Assigned Officer is reviewing the grievance
    UNDER_INVESTIGATION,    // 4 — Active investigation underway
    RESOLUTION_PROPOSED,    // 5 — Officer has proposed a resolution
    CITIZEN_REVIEW,         // 6 — Awaiting citizen feedback on proposed resolution
    ACCEPTED,               // 7 — Citizen has accepted the resolution
    CLOSED,                 // 8 — Grievance fully closed after acceptance
    REJECTED,               // 9 — Citizen has rejected the proposed resolution
    REOPENED,               // 10 — Grievance reopened after citizen rejection
    ESCALATED               // 11 — Escalated due to SLA breach or admin action
}

/**
 * @notice Grievance priority tier, used for SLA deadline computation.
 * @dev Intended SLA durations (configured in EscalationManager, not here):
 *      LOW = 14 days, MEDIUM = 7 days, HIGH = 3 days, CRITICAL = 24 hours.
 *
 * Priority is a fixed enum (unlike Category) because the SLA system depends on a
 * bounded, well-defined set of tiers. Adding a new priority tier would require
 * corresponding SLA configuration — a contract upgrade scenario regardless.
 */
enum Priority {
    LOW,        // 0
    MEDIUM,     // 1
    HIGH,       // 2
    CRITICAL    // 3
}

/**
 * @notice Application-level user role designation.
 * @dev This enum represents role *categories* for data modelling purposes only.
 *      Actual on-chain authorization and permission enforcement is handled by
 *      RoleManager.sol (which will use OpenZeppelin AccessControl).
 *      This enum does NOT grant or check permissions.
 */
enum Role {
    CITIZEN,            // 0 — Default role for any connected wallet
    OFFICER,            // 1 — Government official assigned to a department
    DEPARTMENT_ADMIN,   // 2 — Oversees an entire department
    SUPER_ADMIN         // 3 — System-wide administrator
}

/**
 * @notice Type classification for submitted evidence files.
 * @dev Evidence files are stored on IPFS; only the CID and metadata are on-chain.
 */
enum EvidenceType {
    DOCUMENT,   // 0 — PDFs, text files, official documents
    IMAGE,      // 1 — Photos, screenshots
    VIDEO,      // 2 — Video recordings
    AUDIO,      // 3 — Audio recordings
    OTHER       // 4 — Any other file type
}

/**
 * @notice Status of a proposed resolution from the citizen's perspective.
 */
enum ResolutionStatus {
    PENDING,    // 0 — Resolution proposed, awaiting citizen review
    ACCEPTED,   // 1 — Citizen accepted the resolution
    REJECTED    // 2 — Citizen rejected the resolution
}

/**
 * @notice Enumeration of all auditable actions in the system.
 * @dev Used by AuditTrail.sol to categorize immutable audit log entries.
 *      Every significant state mutation in the system should map to one of these actions.
 */
enum AuditAction {
    USER_REGISTERED,            // 0
    ROLE_GRANTED,               // 1
    ROLE_REVOKED,               // 2
    DEPARTMENT_CREATED,         // 3
    DEPARTMENT_UPDATED,         // 4
    DEPARTMENT_DEACTIVATED,     // 5
    OFFICER_ADDED,              // 6
    OFFICER_REMOVED,            // 7
    GRIEVANCE_CREATED,          // 8
    GRIEVANCE_REGISTERED,       // 9
    GRIEVANCE_ASSIGNED,         // 10
    GRIEVANCE_REASSIGNED,       // 11
    STATUS_CHANGED,             // 12
    INVESTIGATION_STARTED,      // 13
    INVESTIGATION_NOTE_ADDED,   // 14
    EVIDENCE_ADDED,             // 15
    EVIDENCE_REVOKED,           // 16
    RESOLUTION_SUBMITTED,       // 17
    RESOLUTION_ACCEPTED,        // 18
    RESOLUTION_REJECTED,        // 19
    GRIEVANCE_REOPENED,         // 20
    GRIEVANCE_ESCALATED,        // 21
    GRIEVANCE_CLOSED,           // 22
    SLA_UPDATED,                // 23
    CATEGORY_CREATED,           // 24
    CATEGORY_UPDATED,           // 25
    DEPARTMENT_ACTIVATED,       // 26
    CATEGORY_DEACTIVATED,       // 27
    CATEGORY_ACTIVATED,         // 28
    DEPARTMENT_ADMIN_ASSIGNED,  // 29
    DEPARTMENT_ADMIN_REMOVED,   // 30
    GRIEVANCE_REJECTED          // 31
}

// ============================================================================
//  STRUCTS
// ============================================================================

/**
 * @notice Core grievance record.
 * @dev Storage layout note: address (20 bytes) + Status (1 byte) + Priority (1 byte) +
 *      uint8 reopenCount (1 byte) pack into a single 32-byte slot (23 bytes used).
 *      The three uint64 timestamps (createdAt + updatedAt + slaDeadline = 24 bytes) pack
 *      into a single slot.
 *
 * Design decisions:
 * - `title` is a short string stored on-chain for human-readable identification in lists
 *   and event logs. Citizens and admins need a quick identifier without querying IPFS.
 * - `descriptionCid` is the IPFS Content Identifier where the full description text is stored,
 *   enabling the frontend to retrieve and display the content without a backend.
 * - `descriptionHash` is a bytes32 keccak256 hash of the full description text, enabling
 *   on-chain integrity verification of the off-chain content.
 * - `categoryId` is a uint256 referencing a dynamic category registry (NOT a fixed enum).
 *   This allows the Super Admin to create, activate, and deactivate categories at runtime.
 *   A Solidity enum would freeze the category set at deployment time.
 * - `assignedOfficer` is address(0) when unassigned.
 * - `currentResolutionId` is 0 when no resolution has been proposed.
 * - `reopenCount` tracks how many times a grievance has been reopened (max 255).
 */
struct Grievance {
    uint256 id;                     // Unique grievance identifier (generated by GrievanceSystem)
    address citizen;                // Wallet address of the citizen who filed the grievance
    Status status;                  // Current lifecycle status
    Priority priority;              // Priority tier (determines SLA deadline)
    uint8 reopenCount;              // Number of times this grievance has been reopened
    address assignedOfficer;        // Wallet address of the assigned officer (address(0) if unassigned)
    uint256 departmentId;           // ID of the responsible department
    uint256 categoryId;             // ID referencing the dynamic category registry
    string title;                   // Short on-chain title (kept brief to control gas)
    string descriptionCid;          // IPFS CID of the full description text (for retrieval)
    bytes32 descriptionHash;        // keccak256 hash of the full description (for integrity)
    uint64 createdAt;               // Timestamp when the grievance was submitted
    uint64 updatedAt;               // Timestamp of the most recent status change
    uint64 slaDeadline;             // SLA deadline timestamp (computed by EscalationManager)
    uint256 currentResolutionId;    // ID of the active resolution proposal (0 if none)
}

/**
 * @notice Dynamic category record for grievance classification.
 * @dev Categories are managed by a future contract (not by a fixed enum).
 *      The Super Admin can create, activate, and deactivate categories at runtime.
 *      This struct defines the data shape; management logic belongs in DepartmentManager
 *      or a dedicated CategoryManager contract.
 */
struct GrievanceCategory {
    uint256 id;             // Unique category identifier
    string name;            // Human-readable category name (e.g., "Infrastructure")
    string description;     // Brief description of what this category covers
    bool isActive;          // Whether this category is currently available for new grievances
    uint64 createdAt;       // Timestamp when the category was created
}

/**
 * @notice Department registry record.
 */
struct Department {
    uint256 id;             // Unique department identifier
    string name;            // Department name (e.g., "Public Works", "Health Services")
    address admin;          // Wallet address of the Department Admin
    bool isActive;          // Whether the department is currently operational
    uint64 createdAt;       // Timestamp when the department was registered
    uint64 updatedAt;       // Timestamp of the last modification
}

/**
 * @notice Evidence metadata record.
 * @dev The evidence record's core data (id, grievanceId, submitter, CID, contentHash,
 *      evidenceType, submittedAt) is immutable once created — never overwritten or deleted.
 *
 *      `isActive` is the sole mutable field. It represents administrative validity:
 *      - true: evidence is considered valid and relevant.
 *      - false: evidence has been administratively revoked (e.g., found to be fraudulent,
 *        irrelevant, or submitted in error).
 *      Revocation does NOT delete the record. The historical evidence entry, its CID, and
 *      its content hash remain permanently on-chain. Revocations are additionally recorded
 *      by the AuditTrail (EVIDENCE_REVOKED action) for full traceability.
 *
 * Design: `ipfsCid` is stored as a string because IPFS CIDv1 strings (e.g., base32/base58)
 * can exceed 32 bytes. `contentHash` is the keccak256 of the raw file bytes for
 * on-chain integrity verification independent of the IPFS layer.
 */
struct Evidence {
    uint256 id;             // Unique evidence identifier
    uint256 grievanceId;    // ID of the associated grievance
    address submitter;      // Wallet address of the uploader (citizen or officer)
    EvidenceType evidenceType;  // Classification of the evidence file
    bool isActive;          // Administrative validity flag (see @dev note above)
    string ipfsCid;         // IPFS Content Identifier (CIDv0 or CIDv1 string)
    bytes32 contentHash;    // keccak256 hash of the raw evidence file
    uint64 submittedAt;     // Timestamp when the evidence was submitted
}

/**
 * @notice Investigation note — an immutable, append-only record.
 * @dev Investigation notes are NEVER overwritten. Each note during an investigation creates
 *      a new InvestigationNote entry, preserving a complete chronological history.
 *
 *      `contentHash` is the keccak256 of the full note text (stored off-chain via IPFS).
 *      `contentCid` is the IPFS CID for retrieval.
 *
 *      This struct is intentionally decoupled from the AuditAction enum. Investigation notes
 *      are investigation-specific data; the AuditTrail contract independently records the
 *      system-wide INVESTIGATION_NOTE_ADDED action. Coupling them would create an unnecessary
 *      dependency between the investigation layer and the audit layer.
 */
struct InvestigationNote {
    uint256 id;             // Unique note identifier
    uint256 grievanceId;    // ID of the associated grievance
    address investigator;   // Wallet address of the officer who authored the note
    string contentCid;      // IPFS CID of the full note text (for retrieval)
    bytes32 contentHash;    // keccak256 hash of the note content (for integrity)
    uint64 timestamp;       // Timestamp when the note was recorded
}

/**
 * @notice Assignment record — tracks grievance assignment and reassignment history.
 * @dev Each assignment or reassignment creates a new record (append-only).
 *      This ensures a full audit trail of who assigned what to whom and when.
 */
struct Assignment {
    uint256 grievanceId;    // ID of the associated grievance
    uint256 departmentId;   // ID of the department the grievance is assigned to
    address assignedOfficer;    // Wallet address of the officer receiving the assignment
    address assignedBy;     // Wallet address of the admin who made the assignment
    uint64 assignedAt;      // Timestamp of the assignment
}

/**
 * @notice Resolution proposal record.
 * @dev A grievance may have multiple resolution proposals over its lifecycle
 *      (e.g., after rejection and reopening). Each proposal is a separate record.
 *
 * `resolutionCid` is the IPFS CID for retrieving the full resolution description.
 * `resolutionHash` is the keccak256 for on-chain integrity verification.
 * `rejectionReasonHash` is bytes32(0) unless the resolution was rejected.
 */
struct Resolution {
    uint256 id;                     // Unique resolution identifier
    uint256 grievanceId;            // ID of the associated grievance
    address proposedBy;             // Wallet address of the officer who proposed the resolution
    ResolutionStatus status;        // Current review status (Pending / Accepted / Rejected)
    string resolutionCid;           // IPFS CID of the resolution description (for retrieval)
    bytes32 resolutionHash;         // keccak256 hash of the resolution description (for integrity)
    bytes32 rejectionReasonHash;    // keccak256 hash of citizen's rejection reason (bytes32(0) if N/A)
    uint64 proposedAt;              // Timestamp when the resolution was proposed
    uint64 reviewedAt;              // Timestamp when the citizen reviewed (0 if still pending)
}

/**
 * @notice Immutable audit log entry.
 * @dev Every significant system action is recorded as an AuditEntry.
 *      Entries are append-only and cannot be modified or deleted.
 */
struct AuditEntry {
    uint256 id;             // Unique audit entry identifier
    AuditAction action;     // The type of action that occurred
    address actor;          // Wallet address of the user who performed the action
    uint256 targetId;       // Context-dependent: grievance ID, department ID, or 0
    bytes32 detailsHash;    // keccak256 hash of any additional detail text (off-chain)
    uint64 timestamp;       // Timestamp when the action was recorded
}

// ============================================================================
//  CUSTOM ERRORS
// ============================================================================

// --- Access & Authorization ---
/// @notice Caller does not have the required role for this operation.
error Unauthorized(address caller, string requiredRole);

/// @notice Operation attempted on a zero address where a valid address is required.
error ZeroAddressNotAllowed();

// --- Grievance Errors ---
/// @notice Referenced grievance does not exist.
error GrievanceNotFound(uint256 grievanceId);

/// @notice The requested status transition is not permitted from the current status.
error InvalidStatusTransition(uint256 grievanceId, Status currentStatus, Status targetStatus);

/// @notice Caller is not the citizen who filed this grievance.
error NotGrievanceOwner(uint256 grievanceId, address caller);

/// @notice The grievance title is empty or exceeds the allowed length.
error InvalidTitle();

// --- Category Errors ---
/// @notice Referenced category does not exist in the dynamic category registry.
error CategoryNotFound(uint256 categoryId);

/// @notice The category is deactivated and cannot be used for new grievances.
error CategoryNotActive(uint256 categoryId);

// --- Department Errors ---
/// @notice Referenced department does not exist.
error DepartmentNotFound(uint256 departmentId);

/// @notice The department is deactivated and cannot accept new operations.
error DepartmentNotActive(uint256 departmentId);

/// @notice A department with this name already exists.
error DepartmentAlreadyExists(string name);

// --- Officer & Assignment Errors ---
/// @notice The officer is not registered in the specified department.
error OfficerNotInDepartment(address officer, uint256 departmentId);

/// @notice The grievance is not currently assigned to the caller.
error NotAssignedOfficer(uint256 grievanceId, address caller);

/// @notice The grievance has already been assigned to an officer.
error GrievanceAlreadyAssigned(uint256 grievanceId);

// --- Evidence Errors ---
/// @notice The IPFS CID string is empty.
error EmptyIPFSCid();

/// @notice The content hash is empty (bytes32(0)).
error EmptyContentHash();

/// @notice Referenced evidence does not exist.
error EvidenceNotFound(uint256 evidenceId);

// --- Resolution Errors ---
/// @notice Referenced resolution does not exist.
error ResolutionNotFound(uint256 resolutionId);

/// @notice A resolution is already pending citizen review for this grievance.
error ResolutionAlreadyPending(uint256 grievanceId);

// --- SLA & Escalation Errors ---
/// @notice The SLA deadline has not yet been breached; escalation is not permitted.
error SLANotBreached(uint256 grievanceId, uint64 deadline, uint64 currentTime);

/// @notice The grievance has already been escalated and awaits reassignment.
error AlreadyEscalated(uint256 grievanceId);

// --- General Validation ---
/// @notice A required string parameter is empty.
error EmptyString(string parameterName);

/// @notice A numeric value is out of the acceptable range.
error ValueOutOfRange(string parameterName, uint256 value, uint256 minValue, uint256 maxValue);

// --- Lifecycle State Errors ---
/// @notice The department is already active.
error DepartmentAlreadyActive(uint256 departmentId);

/// @notice The category is already active.
error CategoryAlreadyActive(uint256 categoryId);

/// @notice Department admin is not assigned for this department.
error DepartmentAdminNotAssigned(uint256 departmentId);
