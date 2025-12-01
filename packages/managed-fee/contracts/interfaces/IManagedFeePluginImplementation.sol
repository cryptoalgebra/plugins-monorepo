// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IManagedFeePluginImplementation
/// @notice Interface for ManagedFee plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in ManagedFeeConnector
interface IManagedFeePluginImplementation {
  function initializeManagedFee() external;
  function setWhitelistStatus(address _address, bool status) external;
  function isWhitelisted(address _address) external view returns (bool);
  function getManagedFee(bytes memory pluginData) external returns (uint24 fee);
}
