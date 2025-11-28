// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for the IFeeDiscountPluginFactory
interface IFeeDiscountPluginFactory {
  /// @notice Emitted when the fee discount registry is changed
  /// @param newFeeDiscountRegistry The new fee discount registry address
  event FeeDiscountRegistry(address newFeeDiscountRegistry);

  /// @notice Returns the address of the fee discount registry
  /// @return The fee discount registry contract address
  function feeDiscountRegistry() external view returns (address);

  /// @notice Changes the fee discount registry address
  /// @param newFeeDiscountRegistry The new fee discount registry address
  function setFeeDiscountRegistry(address newFeeDiscountRegistry) external;
}
