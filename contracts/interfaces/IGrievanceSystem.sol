// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Priority, Grievance, Evidence, InvestigationNote, Assignment, Resolution} from "../GrievanceTypes.sol";

interface IGrievanceSystem {
    function createGrievance(
        uint256 categoryId,
        uint256 departmentId,
        Priority priority,
        string calldata title,
        string calldata descriptionCid,
        bytes32 descriptionHash
    ) external returns (uint256 grievanceId);

    function registerGrievance(uint256 grievanceId) external;
    function rejectGrievance(uint256 grievanceId, string calldata reason) external;
    function assignOfficer(uint256 grievanceId, address officer) external;
    function reassignOfficer(uint256 grievanceId, address newOfficer) external;

    function startReview(uint256 grievanceId) external;
    function startInvestigation(uint256 grievanceId) external;
    function addInvestigationNote(uint256 grievanceId, string calldata contentCid, bytes32 contentHash) external returns (uint256);
    function submitResolution(uint256 grievanceId, string calldata resolutionCid, bytes32 resolutionHash) external returns (uint256);
    function resolveGrievance(uint256 grievanceId, string calldata resolutionCid, bytes32 resolutionHash) external returns (uint256);

    function acceptResolution(uint256 grievanceId) external;
    function rejectResolution(uint256 grievanceId, bytes32 rejectionReasonHash) external;
    function reopenGrievance(uint256 grievanceId) external;
    function closeGrievance(uint256 grievanceId) external;

    function getGrievance(uint256 grievanceId) external view returns (Grievance memory);
    function getGrievanceCount() external view returns (uint256);
    function grievanceExists(uint256 grievanceId) external view returns (bool);
    function getCitizenGrievances(address citizen) external view returns (uint256[] memory);
    function getOfficerGrievances(address officer) external view returns (uint256[] memory);
    function getDepartmentGrievances(uint256 departmentId) external view returns (uint256[] memory);
}
