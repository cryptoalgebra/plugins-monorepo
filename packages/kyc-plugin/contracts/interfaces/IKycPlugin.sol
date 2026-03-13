// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IKycPlugin
/// @notice Public interface for the KYC plugin module
/// @dev Uses tx.origin to identify users. Whitelist is managed in KycRegistry.
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
interface IKycPlugin {
  /// @notice Emitted when KYC registry is updated
  event KycRegistryUpdated(address registry);

  /// @notice The user (tx.origin) is not KYC-whitelisted
  error KycNotWhitelisted();

  /// @notice Set the KYC registry address
  /// @param registry The new KYC registry address
  function setKycRegistry(address registry) external;

  /// @notice Get the current KYC registry address
  /// @return The KYC registry contract address
  function getKycRegistry() external view returns (address);
}
