// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../AlgebraDefaultAllInclusivePlugin.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

/// @title Plugin Deployer Library
/// @notice Library for deploying AlgebraDefaultAllInclusivePlugin instances to reduce factory bytecode size
library PluginDeployer {
    /// @notice Deploys a new AlgebraDefaultAllInclusivePlugin instance
    /// @param pool The pool address for the plugin
    /// @param algebraFactory The Algebra factory address
    /// @param pluginFactory The plugin factory address
    /// @param securityRegistry Security plugin registry address
    /// @param limitOrderManager Limit order plugin manager address
    /// @param feeDiscountRegistry Fee discount (whitelist) plugin registry address
    /// @param config The fee configuration
    /// @return plugin The address of the deployed plugin
    function deployPlugin(
        address pool,
        address algebraFactory,
        address pluginFactory,
        address securityRegistry,
        address limitOrderManager,
        address feeDiscountRegistry,
        AlgebraFeeConfiguration memory config
    ) external returns (address plugin) {
        address volatilityOracle = address(new AlgebraDefaultAllInclusivePlugin(
            pool,
            algebraFactory,
            pluginFactory,
            securityRegistry,
            limitOrderManager,
            feeDiscountRegistry,
            config
        ));
        return volatilityOracle;
    }
}
