// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import {ZeroAddressNotAllowed, Unauthorized, AuditAction} from "./GrievanceTypes.sol";
import {IAuditTrail} from "./IAuditTrail.sol";

/**
 * @title RoleManager
 * @notice On-chain role-based access control for the Blockchain-Based Public Grievance
 *         Tracking System. Built on OpenZeppelin AccessControl v5.
 *
 * This contract is the single authoritative source of truth for user authorization.
 * All other contracts in the system (DepartmentManager, GrievanceSystem, EscalationManager,
 * AuditTrail) rely on RoleManager for permission verification.
 *
 * Roles:
 *   SUPER_ADMIN_ROLE      — System-wide administrator. Deployer is the initial holder.
 *                           Can manage all other roles. Self-administered.
 *   DEPARTMENT_ADMIN_ROLE — Department overseer. Can manage Officer roles.
 *                           Granted/revoked only by Super Admin.
 *   OFFICER_ROLE          — Government official. Granted by Super Admin or Department Admin.
 *   CITIZEN_ROLE          — Public user. Self-registered via registerCitizen().
 *
 * Architecture decisions:
 * - Multiple roles per wallet are allowed. OpenZeppelin AccessControl naturally supports this.
 *   A wallet can hold CITIZEN_ROLE and OFFICER_ROLE simultaneously. The frontend determines
 *   which dashboard to display based on the highest applicable role.
 * - The Role enum from GrievanceTypes.sol is NOT used for authorization. It exists only for
 *   application-level data modelling. Authorization uses bytes32 role constants and
 *   OpenZeppelin's hasRole() mechanism exclusively.
 * - A safety mechanism prevents removing the last Super Admin. The internal _revokeRole
 *   override catches ALL revocation paths (revokeRole, renounceRole, wrapper functions),
 *   so the system can never become permanently unmanageable.
 * - User profiles (registration status + timestamp) are automatically created when any
 *   role is granted, ensuring every authorized user appears in the on-chain registry.
 * - Department membership (which department an officer belongs to) is NOT managed here.
 *   That responsibility belongs to DepartmentManager.sol.
 */
contract RoleManager is AccessControl {

    // ========================================================================
    //  ROLE CONSTANTS
    // ========================================================================

    /// @notice System-wide administrator. Can manage all other roles. Self-administered.
    bytes32 public constant SUPER_ADMIN_ROLE = keccak256("SUPER_ADMIN_ROLE");

    /// @notice Department overseer. Can grant/revoke Officer roles. Managed by Super Admin.
    bytes32 public constant DEPARTMENT_ADMIN_ROLE = keccak256("DEPARTMENT_ADMIN_ROLE");

    /// @notice Government official. Managed by Super Admin or Department Admin.
    bytes32 public constant OFFICER_ROLE = keccak256("OFFICER_ROLE");

    /// @notice Public citizen. Self-registered via registerCitizen(). Also manageable by Super Admin.
    bytes32 public constant CITIZEN_ROLE = keccak256("CITIZEN_ROLE");

    // ========================================================================
    //  DATA STRUCTURES
    // ========================================================================

    /**
     * @notice Minimal on-chain user registration record.
     * @dev Automatically populated when any role is first granted to an address.
     *      Department membership is NOT stored here — that belongs to DepartmentManager.
     */
    struct UserProfile {
        bool isRegistered;      // Whether this address has ever been granted a role
        uint64 registeredAt;    // Timestamp of initial registration
    }

    // ========================================================================
    //  STATE VARIABLES
    // ========================================================================

    /// @dev Tracks the number of addresses currently holding SUPER_ADMIN_ROLE.
    ///      Used to prevent accidental removal of the last Super Admin.
    uint256 private _superAdminCount;

    /// @dev Maps wallet addresses to their registration profiles.
    mapping(address => UserProfile) private _userProfiles;

    /// @notice Address of the deployed AuditTrail contract.
    address public auditTrail;

    // ========================================================================
    //  CUSTOM ERRORS (contract-specific)
    // ========================================================================

    /// @notice The account already holds the Citizen role.
    error AlreadyRegistered(address account);

    /// @notice Cannot remove the last remaining Super Admin — system would become unmanageable.
    error CannotRevokeLastSuperAdmin();

    // ========================================================================
    //  EVENTS
    // ========================================================================

    /// @notice Emitted when a wallet self-registers as a Citizen.
    event CitizenRegistered(address indexed citizen, uint64 timestamp);

    /// @notice Emitted when the Officer role is granted to an address.
    event OfficerRoleGranted(
        address indexed officer,
        address indexed grantedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the Officer role is revoked from an address.
    event OfficerRoleRevoked(
        address indexed officer,
        address indexed revokedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the Department Admin role is granted to an address.
    event DepartmentAdminRoleGranted(
        address indexed admin,
        address indexed grantedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the Department Admin role is revoked from an address.
    event DepartmentAdminRoleRevoked(
        address indexed admin,
        address indexed revokedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the Super Admin role is granted to an address.
    event SuperAdminRoleGranted(
        address indexed admin,
        address indexed grantedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the Super Admin role is revoked from an address.
    event SuperAdminRoleRevoked(
        address indexed admin,
        address indexed revokedBy,
        uint64 timestamp
    );

    /// @notice Emitted when the AuditTrail contract address is updated.
    event AuditTrailUpdated(
        address indexed previousTrail,
        address indexed newTrail,
        address indexed updatedBy,
        uint64 timestamp
    );

    // ========================================================================
    //  MODIFIERS
    // ========================================================================

    /// @dev Restricts access to accounts holding SUPER_ADMIN_ROLE.
    modifier onlySuperAdmin() {
        if (!hasRole(SUPER_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN");
        }
        _;
    }

    /// @dev Restricts access to accounts holding SUPER_ADMIN_ROLE or DEPARTMENT_ADMIN_ROLE.
    modifier onlyAdminOrDeptAdmin() {
        if (
            !hasRole(SUPER_ADMIN_ROLE, msg.sender) &&
            !hasRole(DEPARTMENT_ADMIN_ROLE, msg.sender)
        ) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN or DEPARTMENT_ADMIN");
        }
        _;
    }

    // ========================================================================
    //  CONSTRUCTOR
    // ========================================================================

    /**
     * @notice Deploys the RoleManager and establishes the deployer as the initial Super Admin.
     * @dev Role hierarchy setup:
     *      - SUPER_ADMIN_ROLE is the role-admin for itself and every other role.
     *        This means only Super Admins can use the inherited grantRole()/revokeRole()
     *        for any role. No DEFAULT_ADMIN_ROLE (0x00) is granted to anyone.
     *      - The deployer (msg.sender) receives SUPER_ADMIN_ROLE.
     *      - The _grantRole override automatically creates the deployer's UserProfile
     *        and sets _superAdminCount to 1.
     */
    constructor() {
        // SUPER_ADMIN_ROLE administers itself and every other role
        _setRoleAdmin(SUPER_ADMIN_ROLE, SUPER_ADMIN_ROLE);
        _setRoleAdmin(DEPARTMENT_ADMIN_ROLE, SUPER_ADMIN_ROLE);
        _setRoleAdmin(OFFICER_ROLE, SUPER_ADMIN_ROLE);
        _setRoleAdmin(CITIZEN_ROLE, SUPER_ADMIN_ROLE);

        // Deployer becomes the initial Super Admin
        _grantRole(SUPER_ADMIN_ROLE, msg.sender);
    }

    // ========================================================================
    //  INTERNAL OVERRIDES (OpenZeppelin AccessControl)
    // ========================================================================

    /**
     * @dev Overrides OpenZeppelin _grantRole to:
     *      1. Increment the Super Admin counter when SUPER_ADMIN_ROLE is granted.
     *      2. Auto-register user profiles on first role grant.
     *
     *      This override intercepts ALL grant paths: the inherited grantRole(),
     *      wrapper functions, and the constructor — ensuring state consistency
     *      regardless of how a role is granted.
     *
     * @param role    The bytes32 role identifier being granted.
     * @param account The address receiving the role.
     * @return granted True if the role was newly granted (account didn't already have it).
     */
    function _grantRole(
        bytes32 role,
        address account
    ) internal virtual override returns (bool granted) {
        granted = super._grantRole(role, account);

        if (granted) {
            // Track Super Admin count for lockout prevention
            if (role == SUPER_ADMIN_ROLE) {
                _superAdminCount++;
            }

            // Auto-register user profile on first role grant
            if (!_userProfiles[account].isRegistered) {
                _userProfiles[account] = UserProfile({
                    isRegistered: true,
                    registeredAt: uint64(block.timestamp)
                });
            }
        }
    }

    /**
     * @dev Overrides OpenZeppelin _revokeRole to:
     *      1. Prevent removal of the last Super Admin (system lockout protection).
     *      2. Decrement the Super Admin counter on successful revocation.
     *
     *      This override intercepts ALL revocation paths:
     *      - revokeRole() (admin revoking another account)
     *      - renounceRole() (account renouncing its own role)
     *      - revokeSuperAdminRole() wrapper
     *      Therefore, renounceRole(SUPER_ADMIN_ROLE, ...) is automatically protected
     *      without needing a separate override.
     *
     * @param role    The bytes32 role identifier being revoked.
     * @param account The address losing the role.
     * @return revoked True if the role was actually revoked (account had it).
     */
    function _revokeRole(
        bytes32 role,
        address account
    ) internal virtual override returns (bool revoked) {
        // Block revocation if this would remove the last Super Admin
        if (
            role == SUPER_ADMIN_ROLE &&
            hasRole(SUPER_ADMIN_ROLE, account) &&
            _superAdminCount <= 1
        ) {
            revert CannotRevokeLastSuperAdmin();
        }

        revoked = super._revokeRole(role, account);

        if (revoked && role == SUPER_ADMIN_ROLE) {
            _superAdminCount--;
        }
    }

    // ========================================================================
    //  CITIZEN SELF-REGISTRATION
    // ========================================================================

    /**
     * @notice Allows any wallet to self-register as a Citizen.
     * @dev Citizens are the ONLY role that supports self-assignment. All other roles
     *      require an authorized administrator.
     *
     *      Behavior:
     *      - A wallet that already holds CITIZEN_ROLE cannot register again (reverts).
     *      - A wallet holding other roles (e.g., OFFICER_ROLE) CAN also register as a
     *        Citizen — multiple roles per wallet are permitted.
     *      - msg.sender cannot be address(0) in the EVM, so no zero-address check is needed.
     *
     *      Emits {CitizenRegistered} and OpenZeppelin's {RoleGranted}.
     */
    function registerCitizen() external {
        if (hasRole(CITIZEN_ROLE, msg.sender)) {
            revert AlreadyRegistered(msg.sender);
        }

        _grantRole(CITIZEN_ROLE, msg.sender);

        emit CitizenRegistered(msg.sender, uint64(block.timestamp));
        _recordAudit(AuditAction.USER_REGISTERED, msg.sender, uint256(uint160(msg.sender)), bytes32(0));
    }

    // ========================================================================
    //  OFFICER MANAGEMENT
    // ========================================================================

    /**
     * @notice Grants the Officer role to an address.
     * @dev Callable by Super Admin or Department Admin.
     *
     *      Department Admins are permitted because officers are the operational staff
     *      within departments. Managing officers is a core Department Admin responsibility.
     *
     *      This grants the global OFFICER_ROLE only. Department-specific membership
     *      (which department the officer belongs to) is managed by DepartmentManager.
     *
     *      If the account already has OFFICER_ROLE, no state change occurs and no
     *      domain event is emitted (OpenZeppelin's _grantRole returns false).
     *
     * @param account The address to receive the Officer role.
     */
    function grantOfficerRole(address account) external onlyAdminOrDeptAdmin {
        _validateAddress(account);

        bool granted = _grantRole(OFFICER_ROLE, account);
        if (granted) {
            emit OfficerRoleGranted(account, msg.sender, uint64(block.timestamp));
            _recordAudit(AuditAction.ROLE_GRANTED, msg.sender, uint256(uint160(account)), bytes32(OFFICER_ROLE));
        }
    }

    /**
     * @notice Revokes the Officer role from an address.
     * @dev Callable by Super Admin or Department Admin. Does not erase blockchain history;
     *      the revocation event is permanently recorded on-chain.
     *
     * @param account The address losing the Officer role.
     */
    function revokeOfficerRole(address account) external onlyAdminOrDeptAdmin {
        _validateAddress(account);

        bool revoked = _revokeRole(OFFICER_ROLE, account);
        if (revoked) {
            emit OfficerRoleRevoked(account, msg.sender, uint64(block.timestamp));
            _recordAudit(AuditAction.ROLE_REVOKED, msg.sender, uint256(uint160(account)), bytes32(OFFICER_ROLE));
        }
    }

    // ========================================================================
    //  DEPARTMENT ADMIN MANAGEMENT
    // ========================================================================

    /**
     * @notice Grants the Department Admin role to an address.
     * @dev Callable by Super Admin only. Department Admins CANNOT create other
     *      Department Admins — this prevents uncontrolled privilege escalation.
     *
     * @param account The address to receive the Department Admin role.
     */
    function grantDepartmentAdminRole(address account) external onlySuperAdmin {
        _validateAddress(account);

        bool granted = _grantRole(DEPARTMENT_ADMIN_ROLE, account);
        if (granted) {
            emit DepartmentAdminRoleGranted(account, msg.sender, uint64(block.timestamp));
            _recordAudit(AuditAction.ROLE_GRANTED, msg.sender, uint256(uint160(account)), bytes32(DEPARTMENT_ADMIN_ROLE));
        }
    }

    /**
     * @notice Revokes the Department Admin role from an address.
     * @dev Callable by Super Admin only.
     *
     * @param account The address losing the Department Admin role.
     */
    function revokeDepartmentAdminRole(address account) external onlySuperAdmin {
        _validateAddress(account);

        bool revoked = _revokeRole(DEPARTMENT_ADMIN_ROLE, account);
        if (revoked) {
            emit DepartmentAdminRoleRevoked(account, msg.sender, uint64(block.timestamp));
            _recordAudit(AuditAction.ROLE_REVOKED, msg.sender, uint256(uint160(account)), bytes32(DEPARTMENT_ADMIN_ROLE));
        }
    }

    // ========================================================================
    //  SUPER ADMIN MANAGEMENT
    // ========================================================================

    /**
     * @notice Grants the Super Admin role to an additional address.
     * @dev Callable by Super Admin only. Multiple Super Admins are allowed for
     *      operational redundancy. The _grantRole override increments the counter.
     *
     * @param account The address to receive the Super Admin role.
     */
    function grantSuperAdminRole(address account) external onlySuperAdmin {
        _validateAddress(account);

        bool granted = _grantRole(SUPER_ADMIN_ROLE, account);
        if (granted) {
            emit SuperAdminRoleGranted(account, msg.sender, uint64(block.timestamp));
            _recordAudit(AuditAction.ROLE_GRANTED, msg.sender, uint256(uint160(account)), bytes32(SUPER_ADMIN_ROLE));
        }
    }

    /**
     * @notice Revokes the Super Admin role from an address.
     * @dev Callable by Super Admin only. The _revokeRole override prevents
     *      removing the last Super Admin to avoid permanent system lockout.
     *
     *      A Super Admin CAN revoke their own Super Admin role (if another exists),
     *      but the last remaining Super Admin is always protected.
     *
     * @param account The address losing the Super Admin role.
     */
    function revokeSuperAdminRole(address account) external onlySuperAdmin {
        _validateAddress(account);

        bool revoked = _revokeRole(SUPER_ADMIN_ROLE, account);
        if (revoked) {
            emit SuperAdminRoleRevoked(account, msg.sender, uint64(block.timestamp));
            _recordAudit(AuditAction.ROLE_REVOKED, msg.sender, uint256(uint160(account)), bytes32(SUPER_ADMIN_ROLE));
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
            IAuditTrail(at).recordAudit(action, actor, targetId, detailsHash);
        }
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Role Checks
    // ========================================================================

    /**
     * @notice Checks whether an address holds the Citizen role.
     * @param account The address to check.
     * @return True if the address has CITIZEN_ROLE.
     */
    function isCitizen(address account) external view returns (bool) {
        return hasRole(CITIZEN_ROLE, account);
    }

    /**
     * @notice Checks whether an address holds the Officer role.
     * @param account The address to check.
     * @return True if the address has OFFICER_ROLE.
     */
    function isOfficer(address account) external view returns (bool) {
        return hasRole(OFFICER_ROLE, account);
    }

    /**
     * @notice Checks whether an address holds the Department Admin role.
     * @param account The address to check.
     * @return True if the address has DEPARTMENT_ADMIN_ROLE.
     */
    function isDepartmentAdmin(address account) external view returns (bool) {
        return hasRole(DEPARTMENT_ADMIN_ROLE, account);
    }

    /**
     * @notice Checks whether an address holds the Super Admin role.
     * @param account The address to check.
     * @return True if the address has SUPER_ADMIN_ROLE.
     */
    function isSuperAdmin(address account) external view returns (bool) {
        return hasRole(SUPER_ADMIN_ROLE, account);
    }

    /**
     * @notice Returns all active role flags for an address in a single call.
     * @dev Convenience function for the frontend. One gas-free call instead of four.
     *
     * @param account The address to query.
     * @return citizen       True if account has CITIZEN_ROLE.
     * @return officer       True if account has OFFICER_ROLE.
     * @return departmentAdmin True if account has DEPARTMENT_ADMIN_ROLE.
     * @return superAdmin    True if account has SUPER_ADMIN_ROLE.
     */
    function getActiveRoles(address account)
        external
        view
        returns (
            bool citizen,
            bool officer,
            bool departmentAdmin,
            bool superAdmin
        )
    {
        citizen = hasRole(CITIZEN_ROLE, account);
        officer = hasRole(OFFICER_ROLE, account);
        departmentAdmin = hasRole(DEPARTMENT_ADMIN_ROLE, account);
        superAdmin = hasRole(SUPER_ADMIN_ROLE, account);
    }

    // ========================================================================
    //  VIEW FUNCTIONS — User Profile
    // ========================================================================

    /**
     * @notice Checks whether an address is registered in the system.
     * @dev An address is registered if it has ever been granted any role.
     *
     * @param account The address to check.
     * @return True if the address has a registration record.
     */
    function isRegistered(address account) external view returns (bool) {
        return _userProfiles[account].isRegistered;
    }

    /**
     * @notice Retrieves the user profile for an address.
     * @param account The address to query.
     * @return profile The user's registration record (isRegistered, registeredAt).
     */
    function getUserProfile(address account)
        external
        view
        returns (UserProfile memory profile)
    {
        return _userProfiles[account];
    }

    /**
     * @notice Returns the current number of addresses holding SUPER_ADMIN_ROLE.
     * @dev Used by the frontend and for safety verification. Must always be >= 1.
     *
     * @return The current Super Admin count.
     */
    function getSuperAdminCount() external view returns (uint256) {
        return _superAdminCount;
    }

    // ========================================================================
    //  INTERNAL HELPERS
    // ========================================================================

    /**
     * @dev Validates that an address is not the zero address.
     *      Applied to all admin grant/revoke target addresses (user-supplied input).
     *      Not applied to registerCitizen() because msg.sender cannot be address(0) in the EVM.
     *
     * @param account The address to validate.
     */
    function _validateAddress(address account) internal pure {
        if (account == address(0)) revert ZeroAddressNotAllowed();
    }
}
