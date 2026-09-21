// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IMsgSender
/// @notice Lets a pool plugin resolve the real end-user behind a contract that calls the pool
/// @dev A plugin should only trust this report from contracts it has explicitly allowed
interface IMsgSender {
  /// @notice Returns the real initiator of the call in progress, or zero if there is none
  function msgSender() external view returns (address);
}
