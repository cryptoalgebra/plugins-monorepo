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

// Two suites fill 65536 timepoints. Either one alone costs minutes, both in one process take over an
// hour, so `npx hardhat test` runs one of them and `pnpm test:slow` runs the other.
// An explicit --grep means the caller chose a filter, so do not invert theirs.
const mocha = process.argv.includes('--grep') ? {} : { grep: '@slow', invert: true };

const config: HardhatUserConfig = {
  networks: baseConfig.networks,
  etherscan: baseConfig.etherscan,
  typechain: baseConfig.typechain,
  mocha,
  dependencyCompiler: {
    paths: [
      'test-utils/contracts/MockFactory.sol',
      'test-utils/contracts/MockPool.sol',
      'test-utils/contracts/MockPluginFactory.sol',
      'test-utils/contracts/MockERC20.sol',
      'test-utils/contracts/BeaconImports.sol',
      '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol',
      '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol',
      '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol',
      '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol',
      'test-utils/contracts/TestERC20.sol',
    ],
  },
  solidity: HIGHEST_OPTIMIZER_COMPILER_SETTINGS
};



export default config;
