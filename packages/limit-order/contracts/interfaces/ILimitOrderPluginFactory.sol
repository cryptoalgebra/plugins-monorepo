// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the ILimitOrderPluginFactory
interface ILimitOrderPluginFactory {

  event LimitOrderManager(address newLimitOrderManager);

  function setLimitOrderManager(address newLimitOrderManager) external;
}
