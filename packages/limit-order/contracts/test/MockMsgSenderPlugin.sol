// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '../interfaces/IMsgSender.sol';

/// @title Mock plugin that records the sender reported by the pool caller
/// @notice Stands in for a permissioned pool plugin on the add liquidity hook
contract MockMsgSenderPlugin is IAlgebraPlugin {
  uint8 internal constant HOOKS_CONFIG = uint8(Plugins.BEFORE_POSITION_MODIFY_FLAG);

  address public lastModifyPositionSender;

  function defaultPluginConfig() external pure returns (uint8) {
    return HOOKS_CONFIG;
  }

  function beforeInitialize(address, uint160) external override returns (bytes4) {
    IAlgebraPool(msg.sender).setPluginConfig(HOOKS_CONFIG);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function beforeModifyPosition(address sender, address, int24, int24, int128, bytes calldata) external override returns (bytes4, uint24) {
    lastModifyPositionSender = IMsgSender(sender).msgSender();
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  function handlePluginFee(uint256, uint256) external pure override returns (bytes4) {
    return IAlgebraPlugin.handlePluginFee.selector;
  }

  function afterInitialize(address, uint160, int24) external pure override returns (bytes4) {
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address, address, bool, int256, uint160, bool, bytes calldata) external pure override returns (bytes4, uint24, uint24) {
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function afterSwap(address, address, bool, int256, uint160, int256, int256, bytes calldata) external pure override returns (bytes4) {
    return IAlgebraPlugin.afterSwap.selector;
  }

  function beforeFlash(address, address, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
    return IAlgebraPlugin.beforeFlash.selector;
  }

  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
    return IAlgebraPlugin.afterFlash.selector;
  }
}
