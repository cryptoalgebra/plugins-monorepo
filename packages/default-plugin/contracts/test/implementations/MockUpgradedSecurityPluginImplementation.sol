// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityRegistry.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPlugin.sol';

/// @title Mock Upgraded Security Plugin Implementation
/// @notice Extended version with new storage fields and functions
/// @dev Demonstrates module upgrade while preserving existing storage
contract MockUpgradedSecurityPluginImplementation {

  bytes32 internal constant SECURITY_NAMESPACE = 0x9487542cdccfb581bd8b0a4955905336ba6ab384679a5f7877ee877650445f00;

  /// @dev EXTENDED storage layout - new fields MUST be added at the end
  struct SecurityLayoutV2 {
    // V1 fields (preserved)
    address securityRegistry;
    // V2 fields (new)
    uint256 checkCount; // Count how many times status was checked
    uint256 lastCheckTimestamp; // When was last check
    bool emergencyMode; // New emergency flag
  }

  /// @dev Fetch pointer of Security plugin's storage
  function _getSecurityLayout() internal pure returns (SecurityLayoutV2 storage layout) {
    bytes32 position = SECURITY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  // ========== V1 FUNCTIONS (preserved API) ==========

  /// @notice Initialize Security plugin (V1 compatible)
  function initializeSecurity(address _securityRegistry) external {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    layout.securityRegistry = _securityRegistry;
  }

  /// @notice Set security registry (V1 compatible)
  function setSecurityRegistry(address _securityRegistry) external {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    layout.securityRegistry = _securityRegistry;
  }

  /// @notice Get security registry (V1 compatible)
  function getSecurityRegistry() external view returns (address) {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    return layout.securityRegistry;
  }

  /// @notice Check pool status (V1 compatible + V2 tracking)
  function checkStatus(address poolAddress) external {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    address securityRegistry = layout.securityRegistry;

    // V2: Track check count and timestamp
    layout.checkCount++;
    layout.lastCheckTimestamp = block.timestamp;

    // V2: Emergency mode blocks everything
    if (layout.emergencyMode) {
      revert ISecurityPlugin.PoolDisabled();
    }

    if (securityRegistry != address(0)) {
      ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(poolAddress);
      if (status != ISecurityRegistry.Status.ENABLED) {
        if (status == ISecurityRegistry.Status.DISABLED) {
          revert ISecurityPlugin.PoolDisabled();
        } else {
          revert ISecurityPlugin.BurnOnly();
        }
      }
    }
  }

  /// @notice Check pool status on burn (V1 compatible + V2 tracking)
  function checkStatusOnBurn(address poolAddress) external {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    address securityRegistry = layout.securityRegistry;

    // V2: Track check count
    layout.checkCount++;
    layout.lastCheckTimestamp = block.timestamp;

    // V2: Emergency mode blocks everything including burns
    if (layout.emergencyMode) {
      revert ISecurityPlugin.PoolDisabled();
    }

    if (securityRegistry != address(0)) {
      ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(poolAddress);
      if (status == ISecurityRegistry.Status.DISABLED) {
        revert ISecurityPlugin.PoolDisabled();
      }
    }
  }

  // ========== V2 NEW FUNCTIONS ==========

  /// @notice Set emergency mode (V2 only)
  function setEmergencyMode(bool enabled) external {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    layout.emergencyMode = enabled;
  }

  /// @notice Get emergency mode status (V2 only)
  function getEmergencyMode() external view returns (bool) {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    return layout.emergencyMode;
  }

  /// @notice Get check statistics (V2 only)
  function getCheckStats() external view returns (uint256 checkCount, uint256 lastCheckTimestamp) {
    SecurityLayoutV2 storage layout = _getSecurityLayout();
    return (layout.checkCount, layout.lastCheckTimestamp);
  }

  /// @notice Check if this is upgraded implementation (V2 only)
  function isUpgradedSecurityImpl() external pure returns (bool) {
    return true;
  }
}
