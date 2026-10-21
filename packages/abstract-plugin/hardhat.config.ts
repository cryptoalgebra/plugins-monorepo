import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import baseConfig, { SOLC_VERSION, EVM_VERSION } from '../../hardhat.base.config';

const config: HardhatUserConfig = {
  networks: baseConfig.networks,
  etherscan: baseConfig.etherscan,
  typechain: baseConfig.typechain,
  // unoptimized, unlike the other packages
  solidity: {
    version: SOLC_VERSION,
    settings: {
      evmVersion: EVM_VERSION,
    },
  },
};

export default config;
