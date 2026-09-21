// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRoleManager {
    function SUPER_ADMIN_ROLE() external view returns (bytes32);
    function DEPARTMENT_ADMIN_ROLE() external view returns (bytes32);
    function OFFICER_ROLE() external view returns (bytes32);
    function CITIZEN_ROLE() external view returns (bytes32);

    function isSuperAdmin(address account) external view returns (bool);
    function isDepartmentAdmin(address account) external view returns (bool);
    function isOfficer(address account) external view returns (bool);
    function isCitizen(address account) external view returns (bool);

    function grantDepartmentAdminRole(address account) external;
    function revokeDepartmentAdminRole(address account) external;
    function grantOfficerRole(address account) external;
    function revokeOfficerRole(address account) external;
    function registerCitizen() external;
}
