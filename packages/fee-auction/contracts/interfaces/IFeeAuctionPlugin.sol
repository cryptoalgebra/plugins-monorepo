// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title Fee Auction Plugin Interface
/// @notice Interface for the Fee Auction Plugin with MEV tax support
interface IFeeAuctionPlugin {
  /// @notice Emitted when the base fee is changed
  /// @param newBaseFee The new base fee value
  event BaseFeeChanged(uint24 newBaseFee);

  /// @notice Emitted when MEV tax parameters are changed
  /// @param mevTaxMultiplier The new MEV tax multiplier
  /// @param maxMevTax The new maximum MEV tax
  event MevTaxParametersChanged(uint24 mevTaxMultiplier, uint24 maxMevTax);

  /// @notice Emitted when MEV tax is enabled or disabled
  /// @param enabled Whether MEV tax is enabled
  event MevTaxEnabledChanged(bool enabled);

  /// @notice Returns the base swap fee
  /// @return The base fee in hundredths of a bip (1 = 0.0001%)
  function baseFee() external view returns (uint24);

  /// @notice Returns the MEV tax multiplier
  /// @dev The MEV tax is calculated as: priorityFee * mevTaxMultiplier / 1e18
  /// @return The MEV tax multiplier
  function mevTaxMultiplier() external view returns (uint24);

  /// @notice Returns the maximum MEV tax
  /// @return The maximum MEV tax in hundredths of a bip
  function maxMevTax() external view returns (uint24);

  /// @notice Returns whether MEV tax is enabled
  /// @return True if MEV tax is enabled
  function mevTaxEnabled() external view returns (bool);

  /// @notice Sets the base swap fee
  /// @param newBaseFee The new base fee
  function setBaseFee(uint24 newBaseFee) external;

  /// @notice Sets the MEV tax parameters
  /// @param newMevTaxMultiplier The new MEV tax multiplier
  /// @param newMaxMevTax The new maximum MEV tax
  function setMevTaxParameters(uint24 newMevTaxMultiplier, uint24 newMaxMevTax) external;

  /// @notice Enables or disables MEV tax
  /// @param enabled Whether to enable MEV tax
  function setMevTaxEnabled(bool enabled) external;
}
