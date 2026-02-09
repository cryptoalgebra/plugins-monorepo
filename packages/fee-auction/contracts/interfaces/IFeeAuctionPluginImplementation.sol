// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IFeeAuctionPluginImplementation
/// @notice Interface for FeeAuction plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in FeeAuctionConnector
interface IFeeAuctionPluginImplementation {
  /// @notice Sets the base swap fee
  /// @param newBaseFee The new base fee value
  function setBaseFee(uint24 newBaseFee) external;

  /// @notice Sets MEV tax parameters
  /// @param newMevTaxMultiplier The new MEV tax multiplier
  /// @param newMaxMevTax The new maximum MEV tax
  function setMevTaxParameters(uint24 newMevTaxMultiplier, uint24 newMaxMevTax) external;

  /// @notice Enables or disables MEV tax
  /// @param enabled Whether to enable MEV tax
  function setMevTaxEnabled(bool enabled) external;

  /// @notice Calculates the MEV tax plugin fee based on stored parameters and current priority fee
  /// @return pluginFee The calculated MEV tax plugin fee
  function getAuctionFee() external view returns (uint24 pluginFee);

  /// @notice Initializes fee auction storage parameters
  /// @param _baseFee The initial base fee
  /// @param _mevTaxMultiplier The initial MEV tax multiplier
  /// @param _maxMevTax The initial maximum MEV tax
  /// @param _mevTaxEnabled Whether MEV tax is initially enabled
  function initializeFeeAuction(uint24 _baseFee, uint24 _mevTaxMultiplier, uint24 _maxMevTax, bool _mevTaxEnabled) external;
}
