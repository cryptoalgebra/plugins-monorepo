// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock Factory for testing upgradeable plugins
/// @notice Simplified mock of IAlgebraFactory for unit tests
contract MockFactory {
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  mapping(bytes32 => mapping(address => bool)) private _roles;
  address public owner;

  constructor() {
    owner = msg.sender;
  }

  function hasRoleOrOwner(bytes32 role, address account) external view returns (bool) {
    if (account == owner) return true;
    return _roles[role][account];
  }

  function grantRole(bytes32 role, address account) external {
    _roles[role][account] = true;
  }

  function revokeRole(bytes32 role, address account) external {
    _roles[role][account] = false;
  }

  function setOwner(address newOwner) external {
    owner = newOwner;
  }
}
