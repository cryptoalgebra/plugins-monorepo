// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IPriceConvergencePlugin {
  error OnlyVault();

  event PriceConvergenceInitialized(address indexed vault, address indexed rebalanceManager, int24 positionWidth);
  event Vault(address indexed vault);
  event RebalanceManager(address indexed rebalanceManager);
  event PositionWidth(int24 positionWidth);

  function initializePriceConvergence(address _vault, address _rebalanceManager, int24 _positionWidth) external;

  function setVault(address _vault) external;

  function setRebalanceManager(address _rebalanceManager) external;

  function setPositionWidth(int24 _positionWidth) external;

  function rebalance(uint160 limitSqrtPrice) external;

  function vault() external view returns (address);

  function rebalanceManager() external view returns (address);

  function positionWidth() external view returns (int24);

  function getPool() external view returns (address);
}
