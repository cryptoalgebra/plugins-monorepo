// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../SecurityPlugin.sol';
import '../SecurityRegistry.sol';

contract SecurityPluginTest is SecurityPlugin {
  constructor(
    address factory,
    address securityRegistry
  ) BaseAbstractPlugin(msg.sender, factory, msg.sender) SecurityPlugin(securityRegistry) {}

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
