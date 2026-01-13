import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import "hardhat-dependency-compiler";
import { SolcUserConfig } from 'hardhat/types';
import baseConfig from '../../hardhat.base.config';

const HIGHEST_OPTIMIZER_COMPILER_SETTINGS: SolcUserConfig = {
  version: '0.8.20',
  settings: {
    evmVersion: 'paris',
    optimizer: {
      enabled: true,
      runs: 1_000_000,
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
      '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol',
      '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol',
      '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol',
    ],
  },
  solidity: HIGHEST_OPTIMIZER_COMPILER_SETTINGS
};

export default config;
