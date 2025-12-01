// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IAbstractPlugin.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeeManager.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/interfaces/IVolatilityOracle.sol';
import '@cryptoalgebra/alm-plugin/contracts/interfaces/IAlmPlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPlugin.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin is
  IAbstractPlugin,
  IDynamicFeeManager,
  IFarmingPlugin,
  IVolatilityOracle,
  IAlmPlugin,
  ISecurityPlugin
{
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with pool and fee configuration
  /// @param pool The Algebra pool address
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address (can be address(0))
  /// @param rebalanceManager The ALM rebalance manager address (can be address(0))
  /// @param slowTwapPeriod Slow TWAP period in seconds for ALM
  /// @param fastTwapPeriod Fast TWAP period in seconds for ALM
  function initialize(
    address pool,
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address rebalanceManager,
    uint32 slowTwapPeriod,
    uint32 fastTwapPeriod
  ) external;
}
