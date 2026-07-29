// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IDualPoolPlugin {
  event DualPoolInitialized(address vault0, address vault1);

  function initializeDualPool(address _vault0, address _vault1) external;

  function vault0() external view returns (address);

  function vault1() external view returns (address);
}
