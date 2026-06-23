// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IPriceConvergencePlugin {
  error OnlyVault();

  event Vault(address indexed vault);

  function setVault(address _vault) external;

  function vault() external view returns (address);
}
