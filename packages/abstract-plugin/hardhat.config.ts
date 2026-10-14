import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import baseConfig from '../../hardhat.base.config';

const config: HardhatUserConfig = {
  networks: baseConfig.networks,
  etherscan: baseConfig.etherscan,
  typechain: baseConfig.typechain,
  solidity: {
    version: '0.8.26',
    settings: {
      evmVersion: 'cancun',
    },
  },
};

export default config;
