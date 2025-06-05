// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
/// @title The interface for the AlgebraDefaultPluginFactory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
interface IAlgebraDefaultPluginFactory is IBasePluginFactory {

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev allows to change settings of AlgebraDefaultPluginFactory
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);

  event SlidingBaseFee(uint16 baseFee);

  /// @notice Returns slidigin base fee value 
  function baseFee() external view returns (uint16);

  function setSlidingBaseFee(uint16 _baseFee) external;
}
