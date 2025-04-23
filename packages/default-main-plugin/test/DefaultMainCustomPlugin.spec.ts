import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { algebraCoreFixture } from 'test-utils/externalFixtures';

import { DefaultMainCustomPluginFactory } from '../typechain';
import { AlgebraFactory } from '@cryptoalgebra/integral-core/typechain';

describe('DefaultMainCustomPluginFactory', () => {
  let wallet: Wallet, other: Wallet;

  let factory: AlgebraFactory;
  let customPluginFactory: DefaultMainCustomPluginFactory;
  let tokens: [string, string];

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test volatilityOracle & custom deployer', async () => {
    const fix  = await loadFixture(algebraCoreFixture)
    factory = fix.factory;
    const customDeployerFactory = await ethers.getContractFactory('DefaultMainCustomPluginFactory');
    customPluginFactory = (await customDeployerFactory.deploy(factory, fix.entryPoint)) as any as DefaultMainCustomPluginFactory;

    tokens = ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002"];
  });

  describe('#Create custom pool', () => {
    it('only custom deployer', async () => {
      expect(customPluginFactory.beforeCreatePoolHook(wallet.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')).to.be
        .revertedWithoutReason;
    });

    it('custom pool is created', async () => {
      await customPluginFactory.createCustomPool(wallet.address, tokens[0], tokens[1], '0x');

      const poolAddress = await factory.customPoolByPair(customPluginFactory, tokens[0], tokens[1]); 
      await expect(poolAddress).to.not.eq(ZERO_ADDRESS);
      expect(await customPluginFactory.pluginByPool(poolAddress)).to.not.eq(ZERO_ADDRESS);   
    });
  });

});