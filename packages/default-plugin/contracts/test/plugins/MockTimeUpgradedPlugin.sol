// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './MockTimeAlgebraUpgradeablePlugin.sol';
import '@cryptoalgebra/integral-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import '@cryptoalgebra/integral-periphery/contracts/interfaces/ISwapRouter.sol';

/// @title Mock Time Upgraded Plugin for testing upgrades with time manipulation
/// @notice Extends MockTimeAlgebraUpgradeablePlugin to keep advanceTime() after upgrade
contract MockTimeUpgradedPlugin is MockTimeAlgebraUpgradeablePlugin {
  bytes32 internal constant UPGRADE_TEST_NAMESPACE = keccak256('algebra.storage.upgradetest');

  struct UpgradeTestLayout {
    uint256 newVariable;
  }

  function _getUpgradeTestLayout() internal pure returns (UpgradeTestLayout storage layout) {
    bytes32 position = UPGRADE_TEST_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl,
    address _reflexImpl,
    address _feeDiscountImpl
  )
    MockTimeAlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl,
      _reflexImpl,
      _feeDiscountImpl
    )
  {}

  function newUpgradeableFunction() external pure returns (uint256) {
    return 42;
  }

  function setNewVariable(uint256 value) external {
    _authorize();
    _getUpgradeTestLayout().newVariable = value;
  }

  function getNewVariable() external view returns (uint256) {
    return _getUpgradeTestLayout().newVariable;
  }

  function isUpgraded() external pure returns (bool) {
    return true;
  }
}
