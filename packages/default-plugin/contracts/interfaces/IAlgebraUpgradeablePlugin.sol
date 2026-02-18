// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM, Security and MevX
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with fee configuration, security registry, and MevX settings
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param mevxRouter The MevX router address
  /// @param mevxExecutor The MevX executor address
  /// @param profitDistributor The profit distributor address
  /// @param mevxConfigId The MevX configuration ID
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address mevxRouter,
    address mevxExecutor,
    address profitDistributor,
    bytes32 mevxConfigId
  ) external;
}
