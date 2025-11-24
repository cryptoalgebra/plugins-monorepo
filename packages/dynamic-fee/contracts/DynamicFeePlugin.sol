// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';

import './interfaces/IDynamicFeeManager.sol';

import './libraries/AdaptiveFee.sol';
import { AlgebraFeeConfigurationU144 } from './types/AlgebraFeeConfigurationU144.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';
import './DynamicFeeConnector.sol';

/// @title Algebra Integral 1.2.1 default plugin
/// @notice This contract stores timepoints and calculates adaptive fee and statistical averages
abstract contract DynamicFeePlugin is BaseAbstractPlugin, DynamicFeeConnector, IDynamicFeeManager {
  using Plugins for uint8;
  using AlgebraFeeConfigurationU144Lib for AlgebraFeeConfiguration;

  uint8 private constant DYNAMIC_FEE_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  constructor(AlgebraFeeConfiguration memory _config) {
    defaultPluginConfig = defaultPluginConfig | DYNAMIC_FEE_CONFIG;
    AdaptiveFee.validateFeeConfiguration(_config);

    DynamicFeeLayout storage layout = _getDynamicFeeLayout();
    layout.feeConfig = _config.pack(); // pack struct to uint144 and write in storage

    activeModules.push("Dynamic Fee Plugin");
  }

  /// @inheritdoc IDynamicFeeManager
  function feeConfig()
    external
    view
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    DynamicFeeLayout memory layout = _getDynamicFeeLayout();
    AlgebraFeeConfigurationU144 _feeConfig = layout.feeConfig;
    (alpha1, alpha2) = (_feeConfig.alpha1(), _feeConfig.alpha2());
    (beta1, beta2) = (_feeConfig.beta1(), _feeConfig.beta2());
    (gamma1, gamma2) = (_feeConfig.gamma1(), _feeConfig.gamma2());
    baseFee = _feeConfig.baseFee();
  }

  // ###### Fee manager ######

  /// @inheritdoc IDynamicFeeManager
  function changeFeeConfiguration(AlgebraFeeConfiguration calldata _config) external override {
    _authorize();
    AdaptiveFee.validateFeeConfiguration(_config);

    DynamicFeeLayout storage layout = _getDynamicFeeLayout();
    layout.feeConfig = _config.pack(); // pack struct to uint144 and write in storage
    emit FeeConfiguration(_config);
  }

  function _getCurrentFee(uint88 volatilityAverage) internal view returns (uint16 fee) {
    DynamicFeeLayout memory layout = _getDynamicFeeLayout();
    AlgebraFeeConfigurationU144 feeConfig_ = layout.feeConfig;
    if (feeConfig_.alpha1() | feeConfig_.alpha2() == 0) return feeConfig_.baseFee();

    return AdaptiveFee.getFee(volatilityAverage, feeConfig_);
  }
}
