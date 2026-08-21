// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @dev Namespaced storage for the V2 fields the upgraded module mocks add.
/// @dev Kept apart from the modules own namespaces so the mocks never restate a production layout.
library MockV2Storage {
  struct VolatilityLayout {
    bool enhancedMode;
  }

  struct DynamicFeeLayout {
    bool advancedMode;
  }

  struct FarmingLayout {
    uint256 updateCount;
    uint256 lastUpdateTimestamp;
    bool pausedMode;
  }

  struct AlmLayout {
    bool advancedMode;
  }

  struct SecurityLayout {
    uint256 checkCount;
    uint256 lastCheckTimestamp;
    bool emergencyMode;
  }

  bytes32 internal constant VOLATILITY_NAMESPACE = keccak256('algebra.storage.mock.volatilityoracle.v2');
  bytes32 internal constant DYNAMIC_FEE_NAMESPACE = keccak256('algebra.storage.mock.dynamicfee.v2');
  bytes32 internal constant FARMING_NAMESPACE = keccak256('algebra.storage.mock.farmingproxy.v2');
  bytes32 internal constant ALM_NAMESPACE = keccak256('algebra.storage.mock.alm.v2');
  bytes32 internal constant SECURITY_NAMESPACE = keccak256('algebra.storage.mock.security.v2');

  function volatility() internal pure returns (VolatilityLayout storage s) {
    bytes32 position = VOLATILITY_NAMESPACE;
    assembly {
      s.slot := position
    }
  }

  function dynamicFee() internal pure returns (DynamicFeeLayout storage s) {
    bytes32 position = DYNAMIC_FEE_NAMESPACE;
    assembly {
      s.slot := position
    }
  }

  function farming() internal pure returns (FarmingLayout storage s) {
    bytes32 position = FARMING_NAMESPACE;
    assembly {
      s.slot := position
    }
  }

  function alm() internal pure returns (AlmLayout storage s) {
    bytes32 position = ALM_NAMESPACE;
    assembly {
      s.slot := position
    }
  }

  function security() internal pure returns (SecurityLayout storage s) {
    bytes32 position = SECURITY_NAMESPACE;
    assembly {
      s.slot := position
    }
  }
}
