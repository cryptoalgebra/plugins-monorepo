// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';

/// @title Mock Non-Checker
/// @notice Supports ERC165 but not IAllowlistChecker, for testing AllowlistCheckerRegistry's interface check.
contract MockNonChecker is ERC165 {}
