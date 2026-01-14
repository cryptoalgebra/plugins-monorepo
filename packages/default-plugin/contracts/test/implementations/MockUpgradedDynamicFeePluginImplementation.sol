// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import { AlgebraFeeConfigurationU144, AlgebraFeeConfigurationU144Lib } from '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfigurationU144.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

/// @title Mock Upgraded DynamicFee Plugin Implementation
contract MockUpgradedDynamicFeePluginImplementation {
  using AlgebraFeeConfigurationU144Lib for AlgebraFeeConfiguration;

  bytes32 internal constant DYNAMIC_FEE_NAMESPACE = 0xfbbf1a562c70d290e080160018965a1e5db682cf55e666eca8f391a4ceef9a00;

  struct DynamicFeeLayoutV2 {
    AlgebraFeeConfigurationU144 feeConfig;
    // V2 new fields
    bool advancedMode;
    uint16 customMultiplier;
  }

  function _getDynamicFeeLayout() internal pure returns (DynamicFeeLayoutV2 storage layout) {
    bytes32 position = DYNAMIC_FEE_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  function initializeDynamicFee(AlgebraFeeConfiguration memory config) external {
    AdaptiveFee.validateFeeConfiguration(config);
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    layout.feeConfig = config.pack();
  }

  function getCurrentFee(uint88 volatilityAverage) external view returns (uint16 fee) {
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    AlgebraFeeConfigurationU144 feeConfig_ = layout.feeConfig;

    if (feeConfig_.alpha1() | feeConfig_.alpha2() == 0) return feeConfig_.baseFee();

    fee = AdaptiveFee.getFee(volatilityAverage, feeConfig_);

    // V2: Apply multiplier if in advanced mode
    if (layout.advancedMode && layout.customMultiplier > 0) {
      fee = uint16((uint256(fee) * layout.customMultiplier) / 100);
    }
  }

  function changeFeeConfiguration(AlgebraFeeConfiguration calldata config) external {
    AdaptiveFee.validateFeeConfiguration(config);
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    layout.feeConfig = config.pack();
  }

  function getFeeConfig()
    external
    view
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    AlgebraFeeConfigurationU144 feeConfig_ = layout.feeConfig;

    (alpha1, alpha2) = (feeConfig_.alpha1(), feeConfig_.alpha2());
    (beta1, beta2) = (feeConfig_.beta1(), feeConfig_.beta2());
    (gamma1, gamma2) = (feeConfig_.gamma1(), feeConfig_.gamma2());
    baseFee = feeConfig_.baseFee();
  }

  // V2 NEW functions
  function setAdvancedMode(bool enabled) external {
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    layout.advancedMode = enabled;
  }

  function getAdvancedMode() external view returns (bool) {
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    return layout.advancedMode;
  }

  function setCustomMultiplier(uint16 multiplier) external {
    require(multiplier > 0 && multiplier <= 200, 'Invalid multiplier');
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    layout.customMultiplier = multiplier;
  }

  function getCustomMultiplier() external view returns (uint16) {
    DynamicFeeLayoutV2 storage layout = _getDynamicFeeLayout();
    return layout.customMultiplier;
  }

  function isUpgradedDynamicFeeImpl() external pure returns (bool) {
    return true;
  }
}
