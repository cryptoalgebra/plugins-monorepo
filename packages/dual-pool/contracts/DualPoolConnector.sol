// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolImmutables.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './libraries/DualPoolStorage.sol';
import './interfaces/IDualPoolPlugin.sol';
import './interfaces/IDualPoolPluginImplementation.sol';

abstract contract DualPoolConnector is BaseConnector, IDualPoolPlugin {
  string internal constant DUAL_POOL_MODULE_NAME = 'DualPool Plugin';

  address internal immutable dualPoolImplementation;
  address internal immutable dualPoolToken0;
  address internal immutable dualPoolToken1;

  constructor(address _dualPoolImplementation, address _pool) {
    dualPoolImplementation = _dualPoolImplementation;
    dualPoolToken0 = IAlgebraPoolImmutables(_pool).token0();
    dualPoolToken1 = IAlgebraPoolImmutables(_pool).token1();
  }

  function initializeDualPool(address _vault0, address _vault1) external override {
    _authorize();
    _delegateCall(
      dualPoolImplementation,
      abi.encodeCall(IDualPoolPluginImplementation.initializeDualPool, (_vault0, _vault1, dualPoolToken0, dualPoolToken1))
    );
    emit DualPoolInitialized(_vault0, _vault1);
  }

  function vault0() public view override returns (address) {
    return address(DualPoolStorage.layout().vault0);
  }

  function vault1() public view override returns (address) {
    return address(DualPoolStorage.layout().vault1);
  }
}
