// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '../ManagedFeeConnector.sol';

/// @title Managed Fee Test Harness
/// @notice Thin wrapper around ManagedFeeConnector for unit tests (no auth, emits fee)
contract ManagedFeeTest is ManagedFeeConnector {
  event Fee(uint24 fee);

  constructor(address _managedFeeImplementation) ManagedFeeConnector(_managedFeeImplementation) {}

  function getFeeForSwap(bytes calldata pluginData) external returns (uint24 fee) {
    fee = _getManagedFee(pluginData);
    emit Fee(fee);
  }

  function quoteFee(bytes calldata pluginData) external view returns (uint24) {
    return _quoteManagedFee(pluginData);
  }

  function _authorize() internal view override {}
}
