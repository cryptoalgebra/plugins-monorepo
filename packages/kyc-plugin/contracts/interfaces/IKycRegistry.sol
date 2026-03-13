// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IKycRegistry
/// @notice Registry for managing KYC-gated pool configurations
/// @dev Manages user whitelist. Non-whitelisted users are fully blocked from
/// swap, add liquidity, flash and pool initialization.
/// Remove liquidity is always allowed for everyone.
interface IKycRegistry {
  event UserWhitelistUpdated(address indexed user, bool status);
  event KycPaused();
  event KycUnpaused();

  /// @notice Check if a user is whitelisted (KYC-verified)
  /// @param user The user address
  /// @return True if whitelisted
  function isWhitelisted(address user) external view returns (bool);

  /// @notice Whether KYC verification is globally paused
  /// @return True if paused
  function isPaused() external view returns (bool);

  /// @notice Add or remove a user from the whitelist
  /// @param user The user address
  /// @param status True to whitelist, false to remove
  function setWhitelisted(address user, bool status) external;

  /// @notice Batch add/remove users from the whitelist
  /// @param users Array of user addresses
  /// @param statuses Array of whitelist statuses
  function setWhitelistedBatch(address[] calldata users, bool[] calldata statuses) external;

  /// @notice Pause KYC verification (emergency — all checks bypass)
  function pause() external;

  /// @notice Unpause KYC verification
  function unpause() external;
}
