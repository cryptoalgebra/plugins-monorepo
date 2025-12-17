// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';

contract BeaconProxyDeployer {
  address public lastDeployedProxy;

  function deploy(address beacon, bytes calldata data) external returns (address proxy) {
    proxy = address(new BeaconProxy(beacon, data));
    lastDeployedProxy = proxy;
  }
}
