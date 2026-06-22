import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import "hardhat-contract-sizer";
import "hardhat-dependency-compiler";
import { SolcUserConfig } from 'hardhat/types';
import baseConfig from '../../hardhat.base.config';

const HIGHEST_OPTIMIZER_COMPILER_SETTINGS: SolcUserConfig = {
  version: '0.8.20',
  settings: {
    evmVersion: 'paris',
    optimizer: {
      enabled: true,
      runs: 0,
    },
    metadata: {
      bytecodeHash: 'none',
    },
  },
};

const config: HardhatUserConfig = {
  networks: baseConfig.networks,
  etherscan: baseConfig.etherscan,
  typechain: baseConfig.typechain,
  dependencyCompiler: {
    paths: [
      '@cryptoalgebra/test-utils/contracts/MockFactory.sol',
      '@cryptoalgebra/test-utils/contracts/MockPool.sol',
      '@cryptoalgebra/test-utils/contracts/MockPluginFactory.sol',
      '@cryptoalgebra/test-utils/contracts/MockERC20.sol',
      '@cryptoalgebra/test-utils/contracts/BeaconImports.sol',
      '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol',
      '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol',
      '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol',
      '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
      '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
      '@cryptoalgebra/test-utils/contracts/TestERC20.sol',
      '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePluginImplementation.sol',
      '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPluginImplementation.sol',
      '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPluginImplementation.sol',
      '@cryptoalgebra/safety-switch-plugin/contracts/SecurityRegistry.sol',
    ],
  },
  solidity: HIGHEST_OPTIMIZER_COMPILER_SETTINGS,
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
  }
};

export default config;
