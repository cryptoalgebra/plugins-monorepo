import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { algebraCoreFixture } from 'test-utils/externalFixtures';

import { DefaultAlmCustomPluginFactory } from '../typechain';
import { AlgebraFactory } from '@cryptoalgebra/integral-core/typechain';

describe('AlmCustomPluginFactory', () => {
  let wallet: Wallet, other: Wallet;

  let factory: AlgebraFactory;
  let customPluginFactory: DefaultAlmCustomPluginFactory;
  let tokens: [string, string];

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test volatilityOracle & custom deployer', async () => {
    const fix  = await loadFixture(algebraCoreFixture)
    factory = fix.factory;
    const customDeployerFactory = await ethers.getContractFactory('DefaultAlmCustomPluginFactory');
    customPluginFactory = (await customDeployerFactory.deploy(factory, fix.entryPoint)) as any as DefaultAlmCustomPluginFactory;

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

  describe('#Default fee configuration', () => {
    describe('#setDefaultFeeConfiguration', () => {
      const configuration = {
        alpha1: 3002,
        alpha2: 10009,
        beta1: 1001,
        beta2: 1006,
        gamma1: 20,
        gamma2: 22,
        baseFee: 150,
      };
      it('fails if caller is not owner', async () => {
        await expect(customPluginFactory.connect(other).setDefaultFeeConfiguration(configuration)).to.be.revertedWith('Only administrator');
      });

      it('updates defaultFeeConfiguration', async () => {
        await customPluginFactory.setDefaultFeeConfiguration(configuration);

        const newConfig = await customPluginFactory.defaultFeeConfiguration();

        expect(newConfig.alpha1).to.eq(configuration.alpha1);
        expect(newConfig.alpha2).to.eq(configuration.alpha2);
        expect(newConfig.beta1).to.eq(configuration.beta1);
        expect(newConfig.beta2).to.eq(configuration.beta2);
        expect(newConfig.gamma1).to.eq(configuration.gamma1);
        expect(newConfig.gamma2).to.eq(configuration.gamma2);
        expect(newConfig.baseFee).to.eq(configuration.baseFee);
      });

      it('emits event', async () => {
        await expect(customPluginFactory.setDefaultFeeConfiguration(configuration))
          .to.emit(customPluginFactory, 'DefaultFeeConfiguration')
          .withArgs([
            configuration.alpha1,
            configuration.alpha2,
            configuration.beta1,
            configuration.beta2,
            configuration.gamma1,
            configuration.gamma2,
            configuration.baseFee,
          ]);
      });

      it('cannot exceed max fee', async () => {
        const conf2 = { ...configuration };
        conf2.alpha1 = 30000;
        conf2.alpha2 = 30000;
        conf2.baseFee = 15000;
        await expect(customPluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Max fee exceeded');
      });

      it('cannot set zero gamma', async () => {
        let conf2 = { ...configuration };
        conf2.gamma1 = 0;
        await expect(customPluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Gammas must be > 0');

        conf2 = { ...configuration };
        conf2.gamma2 = 0;
        await expect(customPluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Gammas must be > 0');

        conf2 = { ...configuration };
        conf2.gamma1 = 0;
        conf2.gamma2 = 0;
        await expect(customPluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Gammas must be > 0');
      });
    });
  });

});
