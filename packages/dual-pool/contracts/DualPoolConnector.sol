// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolImmutables.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './libraries/DualPoolStorage.sol';
import './interfaces/IDualPoolPlugin.sol';
import './interfaces/IDualPoolPluginImplementation.sol';

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

  function _initializeDualPool(address _vault0, address _vault1) internal {
    address pool_ = _getPool();
    _delegateCall(
      dualPoolImplementation,
      abi.encodeCall(
        IDualPoolPluginImplementation.initializeDualPool,
        (_vault0, _vault1, IAlgebraPoolImmutables(pool_).token0(), IAlgebraPoolImmutables(pool_).token1())
      )
    );
  }

  /// @inheritdoc IDualPoolPlugin
  function vault0() public view override returns (address) {
    return address(DualPoolStorage.layout().vault0);
  }

  /// @inheritdoc IDualPoolPlugin
  function vault1() public view override returns (address) {
    return address(DualPoolStorage.layout().vault1);
  }
}
