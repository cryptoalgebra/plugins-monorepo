// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IReflexPluginFactory
/// @notice Interface for plugin factories that support Reflex router integration
interface IReflexPluginFactory {
  /// @notice Emitted when the default config ID is changed
  /// @param newConfigId The new default config ID
  event DefaultConfigId(bytes32 newConfigId);

  /// @notice Returns the default router address used for new plugins
  /// @return The default router contract address
  function defaultRouter() external view returns (address);

  /// @notice Returns the default config ID used for new plugins
  /// @return The default config ID
  function defaultConfigId() external view returns (bytes32);

  /// @notice Sets the default router address for new plugins
  /// @param newRouter The new router address to set
  function setRouter(address newRouter) external;

  /// @notice Sets the default config ID for new plugins
  /// @param newConfigId The new config ID to set
  function setConfigId(bytes32 newConfigId) external;
}
