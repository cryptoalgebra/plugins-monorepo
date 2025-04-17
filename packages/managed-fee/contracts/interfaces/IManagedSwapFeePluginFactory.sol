// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the IManagedSwapFeePluginFactory
interface IManagedSwapFeePluginFactory{
  /// @notice Emitted when the router address is changed
  /// @param newRouter The router address after the address was changed
  event DefaultRouter(address newRouter);
  
  /// @notice Returns the address of AlgebraFactory
  /// @return The AlgebraFactory contract address
  function defaultRouter() external view returns (address);

  /// @dev updates router address on the factory
  /// @param newRouterAddress The new router contract address
  function setRouterAddress(address newRouterAddress) external;
}
