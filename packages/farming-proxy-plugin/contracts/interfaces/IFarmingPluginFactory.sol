// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for the PluginFactory which deploys FarmingProxyPlugin
/// @dev This contract contains function that must be implemented by the FarmingProxyPlugin' PluginFactory
interface IFarmingPluginFactory {
  /// @notice Returns current farming address
  /// @return The farming contract address
  function farmingAddress() external view returns (address);

  /// @notice Emitted when the farming address is changed
  /// @param newFarmingAddress The farming address after the address was changed
  event FarmingAddress(address newFarmingAddress);
}
