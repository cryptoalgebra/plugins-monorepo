// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

// Import all implementation contracts to make them available for testing
// These imports ensure Hardhat compiles and generates artifacts for these contracts

import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePluginImplementation.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeePluginImplementation.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPluginImplementation.sol';
import '@cryptoalgebra/alm-plugin/contracts/AlmPluginImplementation.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPluginImplementation.sol';

// Import OpenZeppelin ERC1967Proxy for UUPS factory deployment
import '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';
