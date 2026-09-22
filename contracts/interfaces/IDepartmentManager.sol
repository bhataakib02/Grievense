// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Department, GrievanceCategory} from "../GrievanceTypes.sol";

interface IDepartmentManager {
    function createDepartment(string calldata name, address admin) external returns (uint256);
    function updateDepartment(uint256 departmentId, string calldata newName) external;
    function deactivateDepartment(uint256 departmentId) external;
    function reactivateDepartment(uint256 departmentId) external;
    function activateDepartment(uint256 departmentId) external;
    function setDepartmentAdmin(uint256 departmentId, address newAdmin) external;
    function removeDepartmentAdmin(uint256 departmentId) external;

    function addOfficerToDepartment(uint256 departmentId, address officer) external;
    function removeOfficerFromDepartment(uint256 departmentId, address officer) external;
    function transferOfficerDepartment(address officer, uint256 fromDepartmentId, uint256 toDepartmentId) external;

    function createCategory(string calldata name, string calldata description) external returns (uint256);
    function createCategory(uint256 departmentId, string calldata name, string calldata description) external returns (uint256);
    function updateCategory(uint256 categoryId, string calldata name, string calldata description) external;
    function deactivateCategory(uint256 categoryId) external;
    function reactivateCategory(uint256 categoryId) external;
    function activateCategory(uint256 categoryId) external;

    function getDepartment(uint256 departmentId) external view returns (Department memory);
    function getDepartmentAdmin(uint256 departmentId) external view returns (address);
    function getDepartmentOfficers(uint256 departmentId) external view returns (address[] memory);
    function getDepartmentCount() external view returns (uint256);
    function departmentExists(uint256 departmentId) external view returns (bool);
    function isDepartmentActive(uint256 departmentId) external view returns (bool);

    function isOfficerInDepartment(uint256 departmentId, address officer) external view returns (bool);
    function getOfficerDepartments(address officer) external view returns (uint256[] memory);
    function getOfficerDepartment(address officer) external view returns (uint256);
    function isOfficerActive(address officer) external view returns (bool);
    function isDepartmentAdminFor(uint256 departmentId, address account) external view returns (bool);
    function getAdminDepartments(address admin) external view returns (uint256[] memory);

    function getCategory(uint256 categoryId) external view returns (GrievanceCategory memory);
    function getCategoryCount() external view returns (uint256);
    function categoryExists(uint256 categoryId) external view returns (bool);
    function isCategoryActive(uint256 categoryId) external view returns (bool);
    function getDepartmentCategories(uint256 departmentId) external view returns (uint256[] memory);
    function getCategoryDepartment(uint256 categoryId) external view returns (uint256);
}
