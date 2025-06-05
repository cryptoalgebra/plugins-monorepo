import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { ZERO_ADDRESS, pluginFactoryFixture } from './shared/fixtures';

import { AlgebraDefaultPluginFactory, AlgebraDefaultPlugin, MockFactory } from '../typechain';

describe('AlgebraDefaultPluginFactory', () => {
  let wallet: Wallet, other: Wallet;

  let pluginFactory: AlgebraDefaultPluginFactory;
  let mockAlgebraFactory: MockFactory;

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test volatilityOracle', async () => {
    ({ pluginFactory, mockFactory: mockAlgebraFactory } = await loadFixture(pluginFactoryFixture));
  });

  describe('#Create plugin', () => {
    it('only factory', async () => {
      expect(pluginFactory.beforeCreatePoolHook(wallet.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')).to.be
        .revertedWithoutReason;
    });

    it('factory can create plugin', async () => {
      const pluginFactoryFactory = await ethers.getContractFactory('AlgebraDefaultPluginFactory');
      const pluginFactoryMock = (await pluginFactoryFactory.deploy(wallet.address)) as any as AlgebraDefaultPluginFactory;

      const pluginAddress = await pluginFactoryMock.beforeCreatePoolHook.staticCall(
        wallet.address,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        '0x'
      );

      await pluginFactoryMock.beforeCreatePoolHook(wallet.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');

      const pluginMock = (await ethers.getContractFactory('AlgebraDefaultPlugin')).attach(pluginAddress) as any as AlgebraDefaultPlugin;
      const factor = await pluginMock.s_priceChangeFactor();
      expect(factor).to.be.not.eq(0);
    });
  });

  describe('#CreatePluginForExistingPool', () => {
    it('only if has role', async () => {
      expect(pluginFactory.connect(other).createPluginForExistingPool(wallet.address, other.address)).to.be.revertedWithoutReason;
    });

    it('cannot create for nonexistent pool', async () => {
      await expect(pluginFactory.createPluginForExistingPool(wallet.address, other.address)).to.be.revertedWith('Pool not exist');
    });

    it('can create for existing pool', async () => {
      await mockAlgebraFactory.stubPool(wallet.address, other.address, other.address);

      await pluginFactory.createPluginForExistingPool(wallet.address, other.address);
      const pluginAddress = await pluginFactory.pluginByPool(other.address);
      expect(pluginAddress).to.not.be.eq(ZERO_ADDRESS);
    });

    it('cannot create twice for existing pool', async () => {
      await mockAlgebraFactory.stubPool(wallet.address, other.address, other.address);

      await pluginFactory.createPluginForExistingPool(wallet.address, other.address);

      await expect(pluginFactory.createPluginForExistingPool(wallet.address, other.address)).to.be.revertedWith('Already created');
    });
  });
});
