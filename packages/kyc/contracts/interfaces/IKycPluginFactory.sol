// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the KycPluginFactory
interface IKycPluginFactory {
  /// @notice Emitted when the default OnchainID identity factory address is changed
  /// @param kycIdentityFactory The identity factory address after the address was changed
  event KycIdentityFactory(address kycIdentityFactory);

  /// @notice Emitted when the default required claim topic is changed
  /// @param kycRequiredTopic The required claim topic after the change
  event KycRequiredTopic(uint256 kycRequiredTopic);

  /// @notice Returns current default OnchainID identity factory address
  /// @return The identity factory contract address
  function kycIdentityFactory() external view returns (address);

  /// @notice Returns current default required claim topic
  /// @return The required claim topic
  function kycRequiredTopic() external view returns (uint256);

  /// @dev updates default OnchainID identity factory address on the factory
  /// @param newKycIdentityFactory The new identity factory contract address
  function setKycIdentityFactory(address newKycIdentityFactory) external;

  /// @dev updates default required claim topic on the factory
  /// @param newKycRequiredTopic The new required claim topic
  function setKycRequiredTopic(uint256 newKycRequiredTopic) external;
}
