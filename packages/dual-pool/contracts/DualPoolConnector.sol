// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './libraries/DualPoolStorage.sol';
import './interfaces/IDualPoolPlugin.sol';
import './interfaces/IDualPoolPluginImplementation.sol';
import './DualPoolManager.sol';

/// @dev Holds only a reference to the shared DualPoolManager,
///      which owns all real state and JIT/vault logic for every pool that uses it;
abstract contract DualPoolConnector is BaseConnector, IDualPoolPlugin {
  string internal constant DUAL_POOL_MODULE_NAME = 'DualPool Plugin';
  // beforeSwap: JIT deploy, afterSwap: JIT teardown, beforeModifyPosition: block external mint/burn
  uint8 internal constant DUAL_POOL_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.AFTER_SWAP_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG);

  address internal immutable dualPoolImplementation;

  constructor(address _dualPoolImplementation) {
    dualPoolImplementation = _dualPoolImplementation;
  }

  // supplied by whatever contract composes this connector (e.g. UpgradeableAbstractPlugin)
  function _getPool() internal view virtual returns (address);

  function _setDualPoolManager(address _dualPoolManager) internal {
    _delegateCall(dualPoolImplementation, abi.encodeCall(IDualPoolPluginImplementation.setDualPoolManager, (_dualPoolManager)));
    emit DualPoolManagerSet(_dualPoolManager);
  }

  function _initializeDualPool(address vault0, address vault1) internal {
    DualPoolManager(dualPoolManager()).initializeDualPool(_getPool(), vault0, vault1);
  }

  function _beforeSwap(bool zeroToOne, int256 amountRequired, uint160 limitSqrtPrice) internal {
    DualPoolManager(dualPoolManager()).onBeforeSwap(_getPool(), zeroToOne, amountRequired, limitSqrtPrice);
  }

  function _afterSwap(bool zeroToOne, int256 amount0, int256 amount1) internal {
    DualPoolManager(dualPoolManager()).onAfterSwap(_getPool(), zeroToOne, amount0, amount1);
  }

  /// @inheritdoc IDualPoolPlugin
  function dualPoolManager() public view override returns (address) {
    return address(DualPoolStorage.layout().dualPoolManager);
  }
}
