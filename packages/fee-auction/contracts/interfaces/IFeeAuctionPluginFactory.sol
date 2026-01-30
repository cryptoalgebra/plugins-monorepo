// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';

/// @title Fee Auction Plugin Factory Interface
/// @notice Interface for the Fee Auction Plugin Factory
interface IFeeAuctionPluginFactory is IBasePluginFactory {
  /// @notice Emitted when a new plugin is created
  /// @param pool The pool address
  /// @param plugin The created plugin address
  event PluginCreated(address indexed pool, address plugin);

  /// @notice Emitted when default parameters are changed
  /// @param baseFee The default base fee
  /// @param mevTaxMultiplier The default MEV tax multiplier
  /// @param maxMevTax The default max MEV tax
  /// @param mevTaxEnabled Whether MEV tax is enabled by default
  event DefaultParametersChanged(uint24 baseFee, uint24 mevTaxMultiplier, uint24 maxMevTax, bool mevTaxEnabled);

  /// @notice Returns the default base fee for new plugins
  /// @return The default base fee
  function defaultBaseFee() external view returns (uint24);

  /// @notice Returns the default MEV tax multiplier for new plugins
  /// @return The default MEV tax multiplier
  function defaultMevTaxMultiplier() external view returns (uint24);

  /// @notice Returns the default max MEV tax for new plugins
  /// @return The default max MEV tax
  function defaultMaxMevTax() external view returns (uint24);

  /// @notice Returns whether MEV tax is enabled by default for new plugins
  /// @return Whether MEV tax is enabled by default
  function defaultMevTaxEnabled() external view returns (bool);

  /// @notice Sets the default parameters for new plugins
  /// @param baseFee The default base fee
  /// @param mevTaxMultiplier The default MEV tax multiplier
  /// @param maxMevTax The default max MEV tax
  /// @param mevTaxEnabled Whether MEV tax is enabled by default
  function setDefaultParameters(uint24 baseFee, uint24 mevTaxMultiplier, uint24 maxMevTax, bool mevTaxEnabled) external;
}
