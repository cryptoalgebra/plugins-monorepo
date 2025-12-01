// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock Plugin Factory for testing
/// @notice Simplified mock of plugin factory for unit tests
contract MockPluginFactory {
  address public algebraFactory;

  constructor() {}

  function setAlgebraFactory(address _factory) external {
    algebraFactory = _factory;
  }
}
