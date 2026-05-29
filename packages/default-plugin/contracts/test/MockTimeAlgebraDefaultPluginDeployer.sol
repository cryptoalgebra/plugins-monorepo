// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import '@cryptoalgebra/mevx-plugin/contracts/MevxPlugin.sol';
import './MockTimeAlgebraDefaultPlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityRegistry.sol';

library MockTimeAlgebraDefaultPluginDeployer {
  function deploy(
    address pool,
    address algebraFactory,
    address pluginFactory,
    AlgebraFeeConfiguration memory defaultFeeConfiguration,
    address securityRegistry,
    MevxPlugin.MevxConfig memory mevxConfig
  ) external returns (address) {
    return
      address(
        new MockTimeAlgebraDefaultPlugin(
          pool,
          algebraFactory,
          pluginFactory,
          defaultFeeConfiguration,
          securityRegistry,
          mevxConfig
        )
      );
  }
}
