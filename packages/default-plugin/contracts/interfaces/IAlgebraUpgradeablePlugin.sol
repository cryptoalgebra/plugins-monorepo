// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with fee configuration and security registry
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param mevxRouter MEVX router address (optional)
  /// @param mevxExecutor MEVX executor address (optional)
  /// @param profitDistributor Profit distributor address (optional)
  /// @param mevxConfigId MEVX config identifier
  /// @param feeDiscountRegistry Fee discount registry address (optional)
  /// @param limitOrderManager Limit order manager address (optional)
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address mevxRouter,
    address mevxExecutor,
    address profitDistributor,
    bytes32 mevxConfigId,
    address feeDiscountRegistry,
    address limitOrderManager
  ) external;
}
