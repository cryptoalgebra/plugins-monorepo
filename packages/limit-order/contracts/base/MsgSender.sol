// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../interfaces/IMsgSender.sol';

/// @title MsgSender
/// @notice Reports the real caller of an entry point to plugins that call back mid-transaction
/// @dev The pool only sees this contract as its caller, so a plugin reads the user through `msgSender()`
abstract contract MsgSender is IMsgSender {
  /// @dev Real caller of the entry point in progress, zero otherwise
  address private _msgSenderOverride;

  /// @dev Only for external entry points, not reentrant safe
  modifier reportSender() {
    _msgSenderOverride = msg.sender;
    _;
    _msgSenderOverride = address(0);
  }

  /// @inheritdoc IMsgSender
  function msgSender() external view override returns (address) {
    return _msgSenderOverride;
  }
}
