// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../SecurityPlugin.sol';
import '../SecurityRegistry.sol';

contract SecurityPluginTest is SecurityPlugin {

  uint8 public constant override defaultPluginConfig = 0;
  constructor(address factory, address securityRegistry) AlgebraAbstractPlugin(msg.sender, factory, msg.sender) SecurityPlugin(securityRegistry) {}

  function swap() external {
    _checkStatus();
  }

  function mint() external {
    _checkStatus();
  }

  function burn() external {
    _checkStatusOnBurn();
  }

}
