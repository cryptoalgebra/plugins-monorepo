// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IAbstractPlugin.sol';

interface ISecurityPlugin is IAbstractPlugin {
  function setSecurityRegistry(address registry) external;

  function getSecurityRegistry() external returns (address);

  event SecurityRegistry(address registry);

  error PoolDisabled();
  error BurnOnly();
}
