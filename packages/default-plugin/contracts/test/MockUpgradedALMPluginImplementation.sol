// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/alm-plugin/contracts/interfaces/IRebalanceManager.sol';


contract MockUpgradedALMPluginImplementation {
  
  bytes32 internal constant ALM_NAMESPACE = keccak256('algebra.storage.alm');

 
  struct AlmLayoutV2 {
    
    address rebalanceManager;
    uint32 slowTwapPeriod;
    uint32 fastTwapPeriod;
    // V2 fields (new) 
    bool advancedMode;            
    int24 customThreshold;       
  }

  function _getAlmLayout() internal pure returns (AlmLayoutV2 storage layout) {
    bytes32 position = ALM_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  

  function initializeALM(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) external {
    require(_rebalanceManager != address(0), '_rebalanceManager must be non zero address');
    require(_slowTwapPeriod >= _fastTwapPeriod, '_slowTwapPeriod must be >= _fastTwapPeriod');

    AlmLayoutV2 storage layout = _getAlmLayout();
    layout.rebalanceManager = _rebalanceManager;
    layout.slowTwapPeriod = _slowTwapPeriod;
    layout.fastTwapPeriod = _fastTwapPeriod;
    
    layout.customThreshold = 100; 
  }

  function setSlowTwapPeriod(uint32 _slowTwapPeriod) external {
    AlmLayoutV2 storage layout = _getAlmLayout();
    require(_slowTwapPeriod >= layout.fastTwapPeriod, '_slowTwapPeriod must be >= fastTwapPeriod');
    layout.slowTwapPeriod = _slowTwapPeriod;
  }

  function setFastTwapPeriod(uint32 _fastTwapPeriod) external {
    AlmLayoutV2 storage layout = _getAlmLayout();
    require(_fastTwapPeriod <= layout.slowTwapPeriod, '_fastTwapPeriod must be <= slowTwapPeriod');
    layout.fastTwapPeriod = _fastTwapPeriod;
  }

  function setRebalanceManager(address _rebalanceManager) external {
    AlmLayoutV2 storage layout = _getAlmLayout();
    layout.rebalanceManager = _rebalanceManager;
  }

  function getRebalanceManager() external view returns (address) {
    AlmLayoutV2 storage layout = _getAlmLayout();
    return layout.rebalanceManager;
  }

  function getSlowTwapPeriod() external view returns (uint32) {
    AlmLayoutV2 storage layout = _getAlmLayout();
    return layout.slowTwapPeriod;
  }

  function getFastTwapPeriod() external view returns (uint32) {
    AlmLayoutV2 storage layout = _getAlmLayout();
    return layout.fastTwapPeriod;
  }

  function obtainTWAPAndRebalance(
    int24 currentTick,
    int24 slowTwapTick,
    int24 fastTwapTick,
    uint32 lastBlockTimestamp
  ) external {
    AlmLayout storage layout = _getAlmLayout();
    address manager = layout.rebalanceManager;

    if (manager != address(0)) {
      IRebalanceManager(manager).obtainTWAPAndRebalance(currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp);
    }
  }

  //  V2 NEW FUNCTIONS 

  function setAdvancedMode(bool enabled) external {
    AlmLayoutV2 storage layout = _getAlmLayout();
    layout.advancedMode = enabled;
  }

  function getAdvancedMode() external view returns (bool) {
    AlmLayoutV2 storage layout = _getAlmLayout();
    return layout.advancedMode;
  }

  function setCustomThreshold(int24 threshold) external {
    require(threshold > 0, 'Threshold must be positive');
    AlmLayoutV2 storage layout = _getAlmLayout();
    layout.customThreshold = threshold;
  }

  function getCustomThreshold() external view returns (int24) {
    AlmLayoutV2 storage layout = _getAlmLayout();
    return layout.customThreshold;
  }

  

  function isUpgradedAlmImpl() external pure returns (bool) {
    return true;
  }
}