// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfigurationU144.sol';

/// @title The interface for the Algebra dynamic fee oracle
/// @dev This contract calculates dynamic fee
interface IDynamicFeeOracle {

  /// @notice Default dynamic fee configuration 
  /// @dev See the AdaptiveFee struct for more details
  function defaultFeeConfig() external view returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee);

  /// @notice Set fee configuration for the oracle
  function setFeeConfiguration(address oracle, AlgebraFeeConfiguration calldata feeConfig) external;

  /// @notice Returns fee configuration for the oracle
  /// @dev Returns default fee configuration if config for oracle is not set
  function getFeeConfiguration(address oracle) external view returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee);

  /// @notice Calculates fee for oracle
  /// @dev Uses default fee config if config for oracle is not set
  function getCurrentFee(address oracle) external view returns (uint16 fee);
}
