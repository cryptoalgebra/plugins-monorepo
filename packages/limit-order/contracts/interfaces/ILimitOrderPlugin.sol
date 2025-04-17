// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the AlgebraLimitOrderPlugin
interface ILimitOrderPlugin {

  function limitOrderManager() external view returns (address);

  function setLimitOrderManager(address newModule) external;

  event LimitOrderManager(address newModule);
}
