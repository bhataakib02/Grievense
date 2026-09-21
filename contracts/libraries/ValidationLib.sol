// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ZeroAddressNotAllowed, EmptyString} from "../GrievanceTypes.sol";

library ValidationLib {
    function requireNonZeroAddress(address addr) internal pure {
        if (addr == address(0)) revert ZeroAddressNotAllowed();
    }

    function requireNonEmptyString(string memory str, string memory paramName) internal pure {
        if (bytes(str).length == 0) revert EmptyString(paramName);
    }
}
