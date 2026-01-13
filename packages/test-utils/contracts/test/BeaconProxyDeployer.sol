// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';

contract BeaconProxyDeployer {
  address public lastDeployedProxy;

  function deploy(address beacon, address pool, bytes calldata data) external returns (address proxy) {
    proxy = address(new AlgebraPluginProxy(beacon, pool, data));
    lastDeployedProxy = proxy;
  }
}
