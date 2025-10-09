// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../DefaultAlmPlugin.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

/// @title Plugin Deployer Library
/// @notice Library for deploying DefaultAlmPlugin instances to reduce factory bytecode size
library PluginDeployer {
    /// @notice Deploys a new DefaultAlmPlugin instance
    /// @param pool The pool address for the plugin
    /// @param algebraFactory The Algebra factory address
    /// @param pluginFactory The plugin factory address
    /// @param feeConfiguration The fee configuration
    /// @param securityRegistry The security registry address
    /// @param defaultRouter The default router address
    /// @param configId The config ID for the reflex router
    /// @return plugin The address of the deployed plugin
    function deployPlugin(
        address pool,
        address algebraFactory,
        address pluginFactory,
        AlgebraFeeConfiguration memory feeConfiguration,
        address securityRegistry,
        address defaultRouter,
        bytes32 configId
    ) external returns (address plugin) {
        address volatilityOracle = address(new DefaultAlmPlugin(
            pool,
            algebraFactory,
            pluginFactory,
            feeConfiguration,
            securityRegistry,
            defaultRouter,
            configId
        ));
        return volatilityOracle;
    }
}
