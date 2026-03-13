// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the KycPluginFactory
interface IKycPluginFactory {
  /// @notice Emitted when the KYC registry address is changed
  /// @param kycRegistry The KYC registry address after the address was changed
  event KycRegistry(address kycRegistry);

  /// @notice Returns current kycRegistry address
  /// @return The kycRegistry contract address
  function kycRegistry() external view returns (address);

  /// @dev updates KYC registry address on the factory
  /// @param newKycRegistry The new KYC registry contract address
  function setKycRegistry(address newKycRegistry) external;
}
