// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../ManagedSwapFeePlugin.sol';

contract ManagedSwapFeeTest is ManagedSwapFeePlugin {
  event Fee(uint24 fee);
  uint8 public constant override defaultPluginConfig = 0;
  constructor() BaseAbstractPlugin(msg.sender, msg.sender, msg.sender) ManagedSwapFeePlugin(msg.sender) {}

  function getFeeForSwap(bytes calldata pluginData) external returns (uint24 fee) {
    fee = _getManagedFee(pluginData);
    emit Fee(fee);
  }

  function getGasCostOfGetFeeForSwap(bytes calldata pluginData) external returns (uint256) {
    unchecked {
      uint256 gasBefore = gasleft();
      _getManagedFee(pluginData);
      return gasBefore - gasleft();
    }
  }

  function _authorize() internal view override {

  }
}
