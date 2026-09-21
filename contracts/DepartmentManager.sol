// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RoleManager} from "./RoleManager.sol";
import {IAuditTrail} from "./IAuditTrail.sol";
import {
    Department,
    GrievanceCategory,
    AuditAction,
    // Errors
    Unauthorized,
    ZeroAddressNotAllowed,
    DepartmentNotFound,
    DepartmentNotActive,
    OfficerNotInDepartment,
    CategoryNotFound,
    CategoryNotActive,
    EmptyString,
    DepartmentAlreadyActive,
    CategoryAlreadyActive,
    DepartmentAdminNotAssigned
} from "./GrievanceTypes.sol";

/**
 * @title DepartmentManager
 * @notice Manages the organizational structure of the Blockchain-Based Public Grievance
 *         Tracking System: departments, officer-to-department membership, and dynamic
 *         grievance categories.
 *
 * This contract is the single source of truth for:
 *   1. Department registry — create, update, deactivate, assign admins.
 *   2. Officer-department membership — which officer belongs to which department(s).
 *   3. Grievance category registry — create, update, deactivate dynamic categories.
 *
 * Authorization model:
 *   - All role checks are delegated to the deployed RoleManager contract.
 *   - DepartmentManager NEVER grants or revokes global roles (that is RoleManager's job).
 *   - Super Admin can manage all departments, officers, and categories.
 *   - A Department Admin can only manage officers within the specific department to which
 *     they are assigned. They cannot touch other departments.
 *   - Citizens and Officers without admin privileges have no write access.
 *
 * Data integrity:
 *   - Department and category IDs start at 1 and increase monotonically. ID 0 is reserved.
 *   - Deactivation sets `isActive = false`. Records are NEVER deleted.
 *   - Historical events remain on the blockchain permanently for auditability.
 *   - Officer membership uses a mapping + array pattern for O(1) lookup and enumeration.
 *
 * Integration with future contracts:
 *   - GrievanceSystem.sol will call view functions like `isDepartmentActive()`,
 *     `isCategoryActive()`, and `isOfficerInDepartment()` for validation.
 *   - AuditTrail.sol will independently record audit entries based on events.
 */
contract DepartmentManager {

    // ========================================================================
    //  EXTERNAL DEPENDENCIES
    // ========================================================================

    /// @notice Reference to the deployed RoleManager contract for authorization checks.
    /// @dev Set once in the constructor and never changed.
    RoleManager public immutable roleManager;

    /// @notice Reference to the AuditTrail contract.
    address public auditTrail;

    // ========================================================================
    //  STATE — Departments
    // ========================================================================

    /// @dev Next department ID to assign. Starts at 1 so that ID 0 is reserved/invalid.
    uint256 private _nextDepartmentId = 1;

    /// @dev Department registry. Key = department ID.
    mapping(uint256 => Department) private _departments;

    // ========================================================================
    //  STATE — Officer Membership
    // ========================================================================

    /// @dev O(1) membership check: departmentId => officerAddress => isMember.
    mapping(uint256 => mapping(address => bool)) private _departmentOfficers;

    /// @dev Enumerable officer list per department for frontend getters.
    ///      departmentId => array of officer addresses.
    mapping(uint256 => address[]) private _departmentOfficersList;

    /// @dev Reverse index for swap-and-pop removal: departmentId => officer => arrayIndex.
    mapping(uint256 => mapping(address => uint256)) private _officerIndex;

    /// @dev Departments that an officer belongs to (for `getOfficerDepartments()`).
    ///      officerAddress => array of department IDs.
    mapping(address => uint256[]) private _officerDepartments;

    /// @dev Reverse index for swap-and-pop removal: officer => departmentId => arrayIndex.
    mapping(address => mapping(uint256 => uint256)) private _officerDeptIndex;

    // ========================================================================
    //  STATE — Categories
    // ========================================================================

    /// @dev Next category ID to assign. Starts at 1 so that ID 0 is reserved/invalid.
    uint256 private _nextCategoryId = 1;

    /// @dev Category registry. Key = category ID.
    mapping(uint256 => GrievanceCategory) private _categories;

    // ========================================================================
    //  CUSTOM ERRORS (contract-specific)
    // ========================================================================

    /// @notice The officer is already a member of the specified department.
    error OfficerAlreadyInDepartment(address officer, uint256 departmentId);

    /// @notice The target address does not hold the OFFICER_ROLE in RoleManager.
    error NotAnOfficer(address account);

    /// @notice The target address does not hold the DEPARTMENT_ADMIN_ROLE in RoleManager.
    error NotADepartmentAdmin(address account);

    // ========================================================================
    //  EVENTS
    // ========================================================================

    /// @notice Emitted when a new department is created.
    event DepartmentCreated(
        uint256 indexed departmentId,
        string name,
        address indexed admin,
        address indexed createdBy,
        uint64 timestamp
    );

    /// @notice Emitted when a department's name is updated.
    event DepartmentUpdated(
        uint256 indexed departmentId,
        string newName,
        address indexed updatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a department is deactivated.
    event DepartmentDeactivated(
        uint256 indexed departmentId,
        address indexed deactivatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a department's admin is changed.
    event DepartmentAdminChanged(
        uint256 indexed departmentId,
        address indexed previousAdmin,
        address indexed newAdmin,
        uint64 timestamp
    );

    /// @notice Emitted when an officer is added to a department.
    event OfficerAddedToDepartment(
        uint256 indexed departmentId,
        address indexed officer,
        address indexed addedBy,
        uint64 timestamp
    );

    /// @notice Emitted when an officer is removed from a department.
    event OfficerRemovedFromDepartment(
        uint256 indexed departmentId,
        address indexed officer,
        address indexed removedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a new category is created.
    event CategoryCreated(
        uint256 indexed categoryId,
        string name,
        address indexed createdBy,
        uint64 timestamp
    );

    /// @notice Emitted when a category is updated.
    event CategoryUpdated(
        uint256 indexed categoryId,
        string newName,
        address indexed updatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a category is deactivated.
    event CategoryDeactivated(
        uint256 indexed categoryId,
        address indexed deactivatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a department is reactivated.
    event DepartmentReactivated(
        uint256 indexed departmentId,
        address indexed reactivatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a department admin is removed/unassigned.
    event DepartmentAdminRemoved(
        uint256 indexed departmentId,
        address indexed previousAdmin,
        address indexed removedBy,
        uint64 timestamp
    );

    /// @notice Emitted when a category is reactivated.
    event CategoryReactivated(
        uint256 indexed categoryId,
        address indexed reactivatedBy,
        uint64 timestamp
    );

    /// @notice Emitted when an officer is transferred between departments.
    event OfficerDepartmentTransferred(
        address indexed officer,
        uint256 indexed fromDepartmentId,
        uint256 indexed toDepartmentId,
        address transferredBy,
        uint64 timestamp
    );

    /// @notice Emitted when the AuditTrail contract address is updated.
    event AuditTrailUpdated(address indexed previousAuditTrail, address indexed newAuditTrail);

    // ========================================================================
    //  MODIFIERS
    // ========================================================================

    /// @dev Restricts access to accounts holding SUPER_ADMIN_ROLE in RoleManager.
    modifier onlySuperAdmin() {
        if (!roleManager.isSuperAdmin(msg.sender)) {
            revert Unauthorized(msg.sender, "SUPER_ADMIN");
        }
        _;
    }

    /**
     * @dev Restricts access to Super Admin or the Department Admin assigned to the
     *      specified department. Prevents cross-department administration.
     *
     * @param departmentId The department being operated on.
     */
    modifier onlySuperAdminOrDeptAdminOf(uint256 departmentId) {
        if (!roleManager.isSuperAdmin(msg.sender)) {
            // Must hold the global DEPARTMENT_ADMIN_ROLE AND be the assigned admin
            if (!_isDepartmentAdminFor(departmentId, msg.sender)) {
                revert Unauthorized(msg.sender, "SUPER_ADMIN or assigned DEPARTMENT_ADMIN");
            }
        }
        _;
    }

    // ========================================================================
    //  CONSTRUCTOR
    // ========================================================================

    /**
     * @notice Deploys the DepartmentManager with a reference to the RoleManager.
     * @dev The RoleManager address is stored as `immutable` — it cannot be changed after
     *      deployment. This ensures a stable, tamper-proof authorization link.
     *
     * @param roleManagerAddress The deployed RoleManager contract address.
     */
    constructor(address roleManagerAddress) {
        if (roleManagerAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        roleManager = RoleManager(roleManagerAddress);
    }

    // ========================================================================
    //  AUDIT TRAIL CONFIGURATION
    // ========================================================================

    /**
     * @notice Sets or updates the AuditTrail contract address.
     * @dev Only callable by Super Admin.
     * @param _auditTrail The address of the deployed AuditTrail contract.
     */
    function setAuditTrail(address _auditTrail) external onlySuperAdmin {
        if (_auditTrail == address(0)) revert ZeroAddressNotAllowed();
        address oldAudit = auditTrail;
        auditTrail = _auditTrail;
        emit AuditTrailUpdated(oldAudit, _auditTrail);
    }

    // ========================================================================
    //  DEPARTMENT MANAGEMENT
    // ========================================================================

    /**
     * @notice Creates a new department.
     * @dev Only callable by Super Admin. The admin address must already hold
     *      DEPARTMENT_ADMIN_ROLE in RoleManager. This contract does NOT grant roles.
     *
     * @param name  The department name (cannot be empty).
     * @param admin The address of the Department Admin who will manage this department.
     * @return departmentId The unique ID of the newly created department.
     */
    function createDepartment(
        string calldata name,
        address admin
    ) external onlySuperAdmin returns (uint256 departmentId) {
        // Validate inputs
        if (bytes(name).length == 0) revert EmptyString("name");
        if (admin == address(0)) revert ZeroAddressNotAllowed();
        if (!roleManager.isDepartmentAdmin(admin)) revert NotADepartmentAdmin(admin);

        // Assign ID and create record
        departmentId = _nextDepartmentId++;
        uint64 now_ = uint64(block.timestamp);

        _departments[departmentId] = Department({
            id: departmentId,
            name: name,
            admin: admin,
            isActive: true,
            createdAt: now_,
            updatedAt: now_
        });

        emit DepartmentCreated(departmentId, name, admin, msg.sender, now_);

        _recordAudit(
            AuditAction.DEPARTMENT_CREATED,
            msg.sender,
            departmentId,
            keccak256(bytes(name))
        );
    }

    /**
     * @notice Updates the name of an existing department.
     * @dev Only callable by Super Admin. Department must exist and be active.
     *
     * @param departmentId The department to update.
     * @param newName      The new department name (cannot be empty).
     */
    function updateDepartment(
        uint256 departmentId,
        string calldata newName
    ) external onlySuperAdmin {
        _requireDepartmentExists(departmentId);
        _requireDepartmentActive(departmentId);
        if (bytes(newName).length == 0) revert EmptyString("name");

        Department storage dept = _departments[departmentId];
        dept.name = newName;
        dept.updatedAt = uint64(block.timestamp);

        emit DepartmentUpdated(departmentId, newName, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.DEPARTMENT_UPDATED,
            msg.sender,
            departmentId,
            keccak256(bytes(newName))
        );
    }

    /**
     * @notice Deactivates a department.
     * @dev Only callable by Super Admin. Sets `isActive = false`. The department record
     *      is NOT deleted — historical grievances may reference this department ID.
     *      Officers are NOT automatically removed; their membership records remain.
     *
     * @param departmentId The department to deactivate.
     */
    function deactivateDepartment(uint256 departmentId) external onlySuperAdmin {
        _requireDepartmentExists(departmentId);
        _requireDepartmentActive(departmentId);

        Department storage dept = _departments[departmentId];
        dept.isActive = false;
        dept.updatedAt = uint64(block.timestamp);

        emit DepartmentDeactivated(departmentId, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.DEPARTMENT_DEACTIVATED,
            msg.sender,
            departmentId,
            bytes32(0)
        );
    }

    /**
     * @notice Reactivates a previously deactivated department.
     * @dev Only callable by Super Admin. Sets `isActive = true`.
     * @param departmentId The department to reactivate.
     */
    function reactivateDepartment(uint256 departmentId) public onlySuperAdmin {
        _requireDepartmentExists(departmentId);
        if (_departments[departmentId].isActive) {
            revert DepartmentAlreadyActive(departmentId);
        }

        Department storage dept = _departments[departmentId];
        dept.isActive = true;
        dept.updatedAt = uint64(block.timestamp);

        emit DepartmentReactivated(departmentId, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.DEPARTMENT_ACTIVATED,
            msg.sender,
            departmentId,
            bytes32(0)
        );
    }

    /**
     * @notice Alias for reactivateDepartment to ensure API compatibility.
     * @param departmentId The department to activate.
     */
    function activateDepartment(uint256 departmentId) external onlySuperAdmin {
        reactivateDepartment(departmentId);
    }

    /**
     * @notice Removes/unassigns the admin from a department.
     * @dev Only callable by Super Admin.
     * @param departmentId The department whose admin is being removed.
     */
    function removeDepartmentAdmin(uint256 departmentId) external onlySuperAdmin {
        _requireDepartmentExists(departmentId);

        Department storage dept = _departments[departmentId];
        address previousAdmin = dept.admin;
        if (previousAdmin == address(0)) {
            revert DepartmentAdminNotAssigned(departmentId);
        }

        dept.admin = address(0);
        dept.updatedAt = uint64(block.timestamp);

        emit DepartmentAdminRemoved(departmentId, previousAdmin, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.DEPARTMENT_ADMIN_REMOVED,
            msg.sender,
            departmentId,
            bytes32(uint256(uint160(previousAdmin)))
        );
    }

    /**
     * @notice Changes the admin responsible for a department.
     * @dev Only callable by Super Admin. The new admin must hold DEPARTMENT_ADMIN_ROLE
     *      in RoleManager. This does NOT grant or revoke the global role — only changes
     *      which Department Admin is assigned to this specific department.
     *
     * @param departmentId The department whose admin is being changed.
     * @param newAdmin     The new Department Admin address.
     */
    function setDepartmentAdmin(
        uint256 departmentId,
        address newAdmin
    ) external onlySuperAdmin {
        _requireDepartmentExists(departmentId);
        _requireDepartmentActive(departmentId);
        if (newAdmin == address(0)) revert ZeroAddressNotAllowed();
        if (!roleManager.isDepartmentAdmin(newAdmin)) revert NotADepartmentAdmin(newAdmin);

        Department storage dept = _departments[departmentId];
        address previousAdmin = dept.admin;
        dept.admin = newAdmin;
        dept.updatedAt = uint64(block.timestamp);

        emit DepartmentAdminChanged(departmentId, previousAdmin, newAdmin, uint64(block.timestamp));

        _recordAudit(
            AuditAction.DEPARTMENT_ADMIN_ASSIGNED,
            msg.sender,
            departmentId,
            bytes32(uint256(uint160(newAdmin)))
        );
    }

    // ========================================================================
    //  OFFICER MEMBERSHIP
    // ========================================================================

    /**
     * @notice Adds an officer to a department.
     * @dev Callable by Super Admin or the Department Admin assigned to this department.
     *
     *      Prerequisites (all enforced):
     *      1. Department must exist and be active.
     *      2. Officer address must not be zero.
     *      3. Officer must hold OFFICER_ROLE in RoleManager.
     *      4. Officer must not already be a member of this department.
     *
     *      This function does NOT grant OFFICER_ROLE. If the address lacks the role
     *      in RoleManager, the call reverts with NotAnOfficer.
     *
     * @param departmentId The department to add the officer to.
     * @param officer      The officer's wallet address.
     */
    function addOfficerToDepartment(
        uint256 departmentId,
        address officer
    ) external onlySuperAdminOrDeptAdminOf(departmentId) {
        _requireDepartmentExists(departmentId);
        _requireDepartmentActive(departmentId);
        if (officer == address(0)) revert ZeroAddressNotAllowed();
        if (!roleManager.isOfficer(officer)) revert NotAnOfficer(officer);
        if (_departmentOfficers[departmentId][officer]) {
            revert OfficerAlreadyInDepartment(officer, departmentId);
        }

        // Mark membership
        _departmentOfficers[departmentId][officer] = true;

        // Add to department's officer list
        _officerIndex[departmentId][officer] = _departmentOfficersList[departmentId].length;
        _departmentOfficersList[departmentId].push(officer);

        // Add to officer's department list
        _officerDeptIndex[officer][departmentId] = _officerDepartments[officer].length;
        _officerDepartments[officer].push(departmentId);

        emit OfficerAddedToDepartment(departmentId, officer, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.OFFICER_ADDED,
            msg.sender,
            departmentId,
            bytes32(uint256(uint160(officer)))
        );
    }

    /**
     * @notice Removes an officer from a department.
     * @dev Callable by Super Admin or the Department Admin assigned to this department.
     *
     *      This does NOT revoke the officer's global OFFICER_ROLE — that remains a
     *      RoleManager responsibility. Only department membership is removed.
     *
     *      Uses swap-and-pop for O(1) array removal while maintaining index consistency.
     *
     * @param departmentId The department to remove the officer from.
     * @param officer      The officer's wallet address.
     */
    function removeOfficerFromDepartment(
        uint256 departmentId,
        address officer
    ) external onlySuperAdminOrDeptAdminOf(departmentId) {
        _requireDepartmentExists(departmentId);
        if (officer == address(0)) revert ZeroAddressNotAllowed();
        if (!_departmentOfficers[departmentId][officer]) {
            revert OfficerNotInDepartment(officer, departmentId);
        }

        // Clear membership flag
        _departmentOfficers[departmentId][officer] = false;

        // Swap-and-pop from department's officer list
        _removeFromAddressArray(
            _departmentOfficersList[departmentId],
            _officerIndex[departmentId],
            officer
        );

        // Swap-and-pop from officer's department list
        _removeFromUintArray(
            _officerDepartments[officer],
            _officerDeptIndex[officer],
            departmentId
        );

        emit OfficerRemovedFromDepartment(departmentId, officer, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.OFFICER_REMOVED,
            msg.sender,
            departmentId,
            bytes32(uint256(uint160(officer)))
        );
    }

    /**
     * @notice Transfers an officer from one department to another.
     * @dev Callable by Super Admin or Department Admin of the origin department.
     * @param officer The officer to transfer.
     * @param fromDepartmentId Current department ID.
     * @param toDepartmentId Target department ID (must exist and be active).
     */
    function transferOfficerDepartment(
        address officer,
        uint256 fromDepartmentId,
        uint256 toDepartmentId
    ) external onlySuperAdminOrDeptAdminOf(fromDepartmentId) {
        _requireDepartmentExists(fromDepartmentId);
        _requireDepartmentExists(toDepartmentId);
        _requireDepartmentActive(toDepartmentId);
        if (officer == address(0)) revert ZeroAddressNotAllowed();
        if (!_departmentOfficers[fromDepartmentId][officer]) {
            revert OfficerNotInDepartment(officer, fromDepartmentId);
        }
        if (_departmentOfficers[toDepartmentId][officer]) {
            revert OfficerAlreadyInDepartment(officer, toDepartmentId);
        }

        // Remove from origin
        _departmentOfficers[fromDepartmentId][officer] = false;
        _removeFromAddressArray(
            _departmentOfficersList[fromDepartmentId],
            _officerIndex[fromDepartmentId],
            officer
        );
        _removeFromUintArray(
            _officerDepartments[officer],
            _officerDeptIndex[officer],
            fromDepartmentId
        );

        // Add to destination
        _departmentOfficers[toDepartmentId][officer] = true;
        _officerIndex[toDepartmentId][officer] = _departmentOfficersList[toDepartmentId].length;
        _departmentOfficersList[toDepartmentId].push(officer);
        _officerDeptIndex[officer][toDepartmentId] = _officerDepartments[officer].length;
        _officerDepartments[officer].push(toDepartmentId);

        emit OfficerDepartmentTransferred(officer, fromDepartmentId, toDepartmentId, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.OFFICER_REMOVED,
            msg.sender,
            fromDepartmentId,
            bytes32(uint256(uint160(officer)))
        );
        _recordAudit(
            AuditAction.OFFICER_ADDED,
            msg.sender,
            toDepartmentId,
            bytes32(uint256(uint160(officer)))
        );
    }

    // ========================================================================
    //  CATEGORY MANAGEMENT
    // ========================================================================

    /**
     * @notice Creates a new grievance category.
     * @dev Only callable by Super Admin. Categories use dynamic uint256 IDs (not an enum)
     *      so the Super Admin can add categories at runtime without contract redeployment.
     *
     * @param name        The category name (cannot be empty).
     * @param description A brief description of what this category covers.
     * @return categoryId The unique ID of the newly created category.
     */
    function createCategory(
        string calldata name,
        string calldata description
    ) external onlySuperAdmin returns (uint256 categoryId) {
        if (bytes(name).length == 0) revert EmptyString("name");

        categoryId = _nextCategoryId++;
        uint64 now_ = uint64(block.timestamp);

        _categories[categoryId] = GrievanceCategory({
            id: categoryId,
            name: name,
            description: description,
            isActive: true,
            createdAt: now_
        });

        emit CategoryCreated(categoryId, name, msg.sender, now_);

        _recordAudit(
            AuditAction.CATEGORY_CREATED,
            msg.sender,
            categoryId,
            keccak256(bytes(name))
        );
    }

    /**
     * @notice Updates an existing category's name and description.
     * @dev Only callable by Super Admin. Category must exist and be active.
     *
     * @param categoryId  The category to update.
     * @param name        The new category name (cannot be empty).
     * @param description The new category description.
     */
    function updateCategory(
        uint256 categoryId,
        string calldata name,
        string calldata description
    ) external onlySuperAdmin {
        _requireCategoryExists(categoryId);
        _requireCategoryActive(categoryId);
        if (bytes(name).length == 0) revert EmptyString("name");

        GrievanceCategory storage cat = _categories[categoryId];
        cat.name = name;
        cat.description = description;

        emit CategoryUpdated(categoryId, name, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.CATEGORY_UPDATED,
            msg.sender,
            categoryId,
            keccak256(bytes(name))
        );
    }

    /**
     * @notice Deactivates a category.
     * @dev Only callable by Super Admin. Sets `isActive = false`. The category record
     *      is NOT deleted — existing grievances may reference this category ID.
     *
     * @param categoryId The category to deactivate.
     */
    function deactivateCategory(uint256 categoryId) external onlySuperAdmin {
        _requireCategoryExists(categoryId);
        _requireCategoryActive(categoryId);

        _categories[categoryId].isActive = false;

        emit CategoryDeactivated(categoryId, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.CATEGORY_DEACTIVATED,
            msg.sender,
            categoryId,
            bytes32(0)
        );
    }

    /**
     * @notice Reactivates a previously deactivated category.
     * @dev Only callable by Super Admin.
     * @param categoryId The category to reactivate.
     */
    function reactivateCategory(uint256 categoryId) public onlySuperAdmin {
        _requireCategoryExists(categoryId);
        if (_categories[categoryId].isActive) {
            revert CategoryAlreadyActive(categoryId);
        }

        _categories[categoryId].isActive = true;

        emit CategoryReactivated(categoryId, msg.sender, uint64(block.timestamp));

        _recordAudit(
            AuditAction.CATEGORY_ACTIVATED,
            msg.sender,
            categoryId,
            bytes32(0)
        );
    }

    /**
     * @notice Alias for reactivateCategory.
     * @param categoryId The category to activate.
     */
    function activateCategory(uint256 categoryId) external onlySuperAdmin {
        reactivateCategory(categoryId);
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Departments
    // ========================================================================

    /**
     * @notice Returns the full department record.
     * @param departmentId The department to query.
     * @return The Department struct.
     */
    function getDepartment(uint256 departmentId) external view returns (Department memory) {
        _requireDepartmentExists(departmentId);
        return _departments[departmentId];
    }

    /**
     * @notice Returns the admin address for a department.
     * @param departmentId The department to query.
     * @return The admin's wallet address.
     */
    function getDepartmentAdmin(uint256 departmentId) external view returns (address) {
        _requireDepartmentExists(departmentId);
        return _departments[departmentId].admin;
    }

    /**
     * @notice Returns all officers currently assigned to a department.
     * @dev Returns the full array. For departments with very large officer counts, consider
     *      off-chain indexing via events.
     *
     * @param departmentId The department to query.
     * @return An array of officer wallet addresses.
     */
    function getDepartmentOfficers(uint256 departmentId) external view returns (address[] memory) {
        _requireDepartmentExists(departmentId);
        return _departmentOfficersList[departmentId];
    }

    /**
     * @notice Returns the total number of departments ever created (including deactivated).
     * @return The total department count.
     */
    function getDepartmentCount() external view returns (uint256) {
        return _nextDepartmentId - 1;
    }

    /**
     * @notice Checks whether a department ID has been assigned.
     * @param departmentId The department ID to check.
     * @return True if the department exists (active or inactive).
     */
    function departmentExists(uint256 departmentId) external view returns (bool) {
        return _departmentExists(departmentId);
    }

    /**
     * @notice Checks whether a department is currently active.
     * @param departmentId The department ID to check.
     * @return True if the department exists and is active.
     */
    function isDepartmentActive(uint256 departmentId) external view returns (bool) {
        return _departmentExists(departmentId) && _departments[departmentId].isActive;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Officer Membership
    // ========================================================================

    /**
     * @notice Checks whether an officer is a member of a specific department.
     * @param departmentId The department to check.
     * @param officer      The officer's wallet address.
     * @return True if the officer is currently a member of the department.
     */
    function isOfficerInDepartment(
        uint256 departmentId,
        address officer
    ) external view returns (bool) {
        return _departmentOfficers[departmentId][officer];
    }

    /**
     * @notice Returns all department IDs an officer currently belongs to.
     * @param officer The officer's wallet address.
     * @return An array of department IDs.
     */
    function getOfficerDepartments(address officer) external view returns (uint256[] memory) {
        return _officerDepartments[officer];
    }

    /**
     * @notice Returns the primary department ID of an officer (or 0 if none).
     * @param officer The officer's wallet address.
     * @return The primary department ID.
     */
    function getOfficerDepartment(address officer) external view returns (uint256) {
        if (_officerDepartments[officer].length > 0) {
            return _officerDepartments[officer][0];
        }
        return 0;
    }

    /**
     * @notice Checks whether an officer is active (has OFFICER_ROLE and is in at least one department).
     * @param officer The officer address to check.
     * @return True if active officer.
     */
    function isOfficerActive(address officer) external view returns (bool) {
        return roleManager.isOfficer(officer) && _officerDepartments[officer].length > 0;
    }

    /**
     * @notice Checks whether an account is the assigned Department Admin for a department.
     * @param departmentId The department ID.
     * @param account The address to check.
     * @return True if account is the assigned admin and holds DEPARTMENT_ADMIN_ROLE.
     */
    function isDepartmentAdminFor(uint256 departmentId, address account) external view returns (bool) {
        return _isDepartmentAdminFor(departmentId, account);
    }

    /**
     * @notice Returns all department IDs administered by a given address.
     * @param admin The department admin address.
     * @return An array of department IDs.
     */
    function getAdminDepartments(address admin) external view returns (uint256[] memory) {
        uint256 total = _nextDepartmentId - 1;
        uint256 count = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (_departments[i].admin == admin) {
                count++;
            }
        }
        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (_departments[i].admin == admin) {
                ids[idx] = i;
                idx++;
            }
        }
        return ids;
    }

    // ========================================================================
    //  VIEW FUNCTIONS — Categories
    // ========================================================================

    /**
     * @notice Returns the full category record.
     * @param categoryId The category to query.
     * @return The GrievanceCategory struct.
     */
    function getCategory(uint256 categoryId) external view returns (GrievanceCategory memory) {
        _requireCategoryExists(categoryId);
        return _categories[categoryId];
    }

    /**
     * @notice Returns the total number of categories ever created (including deactivated).
     * @return The total category count.
     */
    function getCategoryCount() external view returns (uint256) {
        return _nextCategoryId - 1;
    }

    /**
     * @notice Checks whether a category ID has been assigned.
     * @param categoryId The category ID to check.
     * @return True if the category exists (active or inactive).
     */
    function categoryExists(uint256 categoryId) external view returns (bool) {
        return _categoryExists(categoryId);
    }

    /**
     * @notice Checks whether a category is currently active.
     * @param categoryId The category ID to check.
     * @return True if the category exists and is active.
     */
    function isCategoryActive(uint256 categoryId) external view returns (bool) {
        return _categoryExists(categoryId) && _categories[categoryId].isActive;
    }

    // ========================================================================
    //  INTERNAL HELPERS — Validation
    // ========================================================================

    /**
     * @dev Checks if a department ID has been assigned (i.e., is within allocated range).
     * @param departmentId The department ID to check.
     * @return True if the ID is >= 1 and < _nextDepartmentId.
     */
    function _departmentExists(uint256 departmentId) internal view returns (bool) {
        return departmentId >= 1 && departmentId < _nextDepartmentId;
    }

    /// @dev Reverts with DepartmentNotFound if the department does not exist.
    function _requireDepartmentExists(uint256 departmentId) internal view {
        if (!_departmentExists(departmentId)) revert DepartmentNotFound(departmentId);
    }

    /// @dev Reverts with DepartmentNotActive if the department is not active.
    function _requireDepartmentActive(uint256 departmentId) internal view {
        if (!_departments[departmentId].isActive) revert DepartmentNotActive(departmentId);
    }

    /**
     * @dev Checks if a category ID has been assigned.
     * @param categoryId The category ID to check.
     * @return True if the ID is >= 1 and < _nextCategoryId.
     */
    function _categoryExists(uint256 categoryId) internal view returns (bool) {
        return categoryId >= 1 && categoryId < _nextCategoryId;
    }

    /// @dev Reverts with CategoryNotFound if the category does not exist.
    function _requireCategoryExists(uint256 categoryId) internal view {
        if (!_categoryExists(categoryId)) revert CategoryNotFound(categoryId);
    }

    /// @dev Reverts with CategoryNotActive if the category is not active.
    function _requireCategoryActive(uint256 categoryId) internal view {
        if (!_categories[categoryId].isActive) revert CategoryNotActive(categoryId);
    }

    // ========================================================================
    //  INTERNAL HELPERS — Authorization
    // ========================================================================

    /**
     * @dev Checks whether an account is the assigned Department Admin for a specific department.
     *      The account must hold DEPARTMENT_ADMIN_ROLE globally AND be the admin stored
     *      in the department record. This prevents cross-department administration.
     *
     * @param departmentId The department to check.
     * @param account      The address to verify.
     * @return True if the account is the assigned admin of the department.
     */
    function _isDepartmentAdminFor(
        uint256 departmentId,
        address account
    ) internal view returns (bool) {
        return
            roleManager.isDepartmentAdmin(account) &&
            _departments[departmentId].admin == account;
    }

    // ========================================================================
    //  INTERNAL HELPERS — Array Management (Swap-and-Pop)
    // ========================================================================

    /**
     * @dev Removes an address from an array using swap-and-pop for O(1) removal.
     *      Updates the index mapping to keep it consistent.
     *
     * @param arr   The storage array to modify.
     * @param index The index mapping (address => position in array) to update.
     * @param value The address to remove.
     */
    function _removeFromAddressArray(
        address[] storage arr,
        mapping(address => uint256) storage index,
        address value
    ) internal {
        uint256 pos = index[value];
        uint256 lastPos = arr.length - 1;

        if (pos != lastPos) {
            address lastValue = arr[lastPos];
            arr[pos] = lastValue;
            index[lastValue] = pos;
        }

        arr.pop();
        delete index[value];
    }

    /**
     * @dev Removes a uint256 from an array using swap-and-pop for O(1) removal.
     *      Updates the index mapping to keep it consistent.
     *
     * @param arr   The storage array to modify.
     * @param index The index mapping (uint256 => position in array) to update.
     * @param value The uint256 to remove.
     */
    function _removeFromUintArray(
        uint256[] storage arr,
        mapping(uint256 => uint256) storage index,
        uint256 value
    ) internal {
        uint256 pos = index[value];
        uint256 lastPos = arr.length - 1;

        if (pos != lastPos) {
            uint256 lastValue = arr[lastPos];
            arr[pos] = lastValue;
            index[lastValue] = pos;
        }

        arr.pop();
        delete index[value];
    }

    // ========================================================================
    //  INTERNAL HELPERS — Audit Recording
    // ========================================================================

    /**
     * @dev Internal helper to record an audit entry if AuditTrail is configured.
     *      Atomic: reverts if recordAudit reverts.
     */
    function _recordAudit(
        AuditAction action,
        address actor,
        uint256 targetId,
        bytes32 detailsHash
    ) internal {
        if (auditTrail != address(0)) {
            IAuditTrail(auditTrail).recordAudit(action, actor, targetId, detailsHash);
        }
    }
}
