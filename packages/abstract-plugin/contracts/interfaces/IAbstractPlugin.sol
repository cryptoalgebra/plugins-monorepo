// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

/// @title The interface for the BasePlugin
interface IAbstractPlugin is IAlgebraPlugin {

  /// @notice Get all active module names
  /// @return moduleNames Array of active module names
  function getActiveModuleNames() external view returns (string[] memory moduleNames);
}
