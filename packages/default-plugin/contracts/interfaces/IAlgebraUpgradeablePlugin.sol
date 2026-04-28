// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @dev Groups all module implementation addresses to avoid stack-too-deep in the constructor
struct PluginImplementations {
  address volatilityOracle;
  address dynamicFee;
  address farmingProxy;
  address alm;
  address security;
  address reflex;
  address feeDiscount;
  address limitOrder;
}

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with fee configuration, security registry, and optional module defaults
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param reflexRouter The default Reflex router
  /// @param reflexConfigId The default Reflex config id
  /// @param feeDiscountRegistry The FeeDiscount registry address
  /// @param limitOrderManager The limit order manager address
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address reflexRouter,
    bytes32 reflexConfigId,
    address feeDiscountRegistry,
    address limitOrderManager
  ) external;
}
