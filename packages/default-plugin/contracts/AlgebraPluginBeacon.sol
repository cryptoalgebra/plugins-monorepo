// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

/// @title UpgradeableBeacon for Algebra Plugin
/// @notice Stores the implementation address for all plugin proxies
/// @dev Uses AlgebraFactory for authorization instead of simple Ownable
contract AlgebraPluginBeacon is UpgradeableBeacon {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  address public immutable algebraFactory;

  /// @notice The plugin factory that created this beacon (authorized for upgrades)
  address public immutable pluginFactory;

  error Unauthorized();

  constructor(address _algebraFactory, address implementation_) UpgradeableBeacon(implementation_) {
    algebraFactory = _algebraFactory;
    pluginFactory = msg.sender;
  }

  /// @notice Upgrades the beacon to a new implementation
  /// @param newImplementation Address of the new implementation
  function upgradeTo(address newImplementation) public override {
    // Allow upgrade from pluginFactory or from authorized accounts via AlgebraFactory
    if (
      msg.sender != pluginFactory &&
      !IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender)
    ) {
      revert Unauthorized();
    }
    super.upgradeTo(newImplementation);
  }
}
