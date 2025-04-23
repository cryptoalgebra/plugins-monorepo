// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/volatility-oracle-plugin/contracts/interfaces/IVolatilityOracle.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfigurationU144.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import '../interfaces/IDynamicFeeOracle.sol';
import '../interfaces/IDefaultMainPlugin.sol';

contract DynamicFeeOracle is Ownable, IDynamicFeeOracle {
  using AlgebraFeeConfigurationU144Lib for AlgebraFeeConfiguration;

  /// @dev AlgebraFeeConfiguration struct packed in uint144
  AlgebraFeeConfigurationU144 internal _defaultFeeConfig;

  /// @dev oracle => fee config
  mapping(address => AlgebraFeeConfigurationU144) internal _feeConfigs;

  constructor(AlgebraFeeConfiguration memory _config) {
    AdaptiveFee.validateFeeConfiguration(_config);

    _defaultFeeConfig = _config.pack();
  }

  /// @inheritdoc IDynamicFeeOracle
  function defaultFeeConfig()
    external
    view
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    return _parseConfig(_defaultFeeConfig);
  }

  /// @inheritdoc IDynamicFeeOracle
  function setFeeConfiguration(address oracle, AlgebraFeeConfiguration calldata _config) external override onlyOwner {
    AdaptiveFee.validateFeeConfiguration(_config);

    _feeConfigs[oracle] = _config.pack();
  }

  /// @inheritdoc IDynamicFeeOracle
  function getFeeConfiguration(address oracle)
    external
    view
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    return _getFeeConfiguration(oracle);
  }

  /// @inheritdoc IDynamicFeeOracle
  function getCurrentFee(address oracle) external view returns (uint16 fee) {
    AlgebraFeeConfigurationU144 feeConfig = _feeConfigs[oracle];
    if (feeConfig.alpha1() | feeConfig.alpha2() == 0) return feeConfig.baseFee();
    uint88 volatilityAverage = IDefaultMainPlugin(oracle).getAverageVolatilityLast();

    return AdaptiveFee.getFee(volatilityAverage, feeConfig);
  }

  function _getFeeConfiguration(address oracle)
    private
    view
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    AlgebraFeeConfigurationU144 feeConfig = _feeConfigs[oracle];
    if(feeConfig.gamma1() == 0){
      return _parseConfig(_defaultFeeConfig);
    } else {
      return _parseConfig(feeConfig);
    }
  }

  function _parseConfig(AlgebraFeeConfigurationU144 feeConfig)
    private
    pure
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    (alpha1, alpha2) = (feeConfig.alpha1(), feeConfig.alpha2());
    (beta1, beta2) = (feeConfig.beta1(), feeConfig.beta2());
    (gamma1, gamma2) = (feeConfig.gamma1(), feeConfig.gamma2());
    baseFee = feeConfig.baseFee();
  }
}
