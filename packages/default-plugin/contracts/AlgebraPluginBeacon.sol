// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/IBeacon.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/// @title UpgradeableBeacon for Algebra Plugin
/// @notice Stores the implementation address for all plugin proxies
contract AlgebraPluginBeacon is IBeacon, Ownable {
  address private _implementation;

  event Upgraded(address indexed implementation);

  constructor(address implementation_) Ownable(msg.sender) {
    _setImplementation(implementation_);
  }

  /// @inheritdoc IBeacon
  function implementation() public view virtual override returns (address) {
    return _implementation;
  }

  /// @notice Upgrades the beacon to a new implementation
  /// @param newImplementation Address of the new implementation
  function upgradeTo(address newImplementation) public virtual onlyOwner {
    _setImplementation(newImplementation);
    emit Upgraded(newImplementation);
  }

  function _setImplementation(address newImplementation) private {
    require(newImplementation.code.length > 0, 'Beacon: implementation is not a contract');
    _implementation = newImplementation;
  }
}
