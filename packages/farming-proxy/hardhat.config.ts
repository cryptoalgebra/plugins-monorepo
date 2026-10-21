import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import "hardhat-dependency-compiler";
import baseConfig, { COMPILER_SETTINGS } from '../../hardhat.base.config';

const config: HardhatUserConfig = {
  networks: baseConfig.networks,
  etherscan: baseConfig.etherscan,
  typechain: baseConfig.typechain,
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
    ],
  },
  solidity: COMPILER_SETTINGS
};

export default config;
