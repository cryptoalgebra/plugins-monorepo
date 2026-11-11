import { expect } from 'chai';
import { ethers } from 'hardhat';
import { getCreateAddress, ZeroAddress } from 'ethers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import FACTORY from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json';
import DEPLOYER from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';
import CALLEE from '@cryptoalgebra/integral-core/artifacts/contracts/test/TestAlgebraCallee.sol/TestAlgebraCallee.json';
import ENTRY_POINT from '@cryptoalgebra/integral-periphery/artifacts/contracts/AlgebraCustomPoolEntryPoint.sol/AlgebraCustomPoolEntryPoint.json';
import WNATIVE from '../../limit-order/test/contracts/WNativeToken.json';
import { tokensFixture } from 'test-utils/externalFixtures';
import { encodePriceSqrt } from 'test-utils/utilities';
import { DEFAULT_FEE_CONFIGURATION, deployImplementations, deployTransparentProxy, moduleArgs } from './shared/fixtures';
import { pinnedCustomPluginFactory, pinnedMockTimePluginFactory } from './shared/pinnedFactory';
import { deployLimitOrderManager } from '../scripts/shared/deployLimitOrderManager';

for (const custom of [false, true]) {
  describe(`Limit orders with the ${custom ? 'custom' : 'default'} base plugin on Integral 1.3`, () => {
    async function fixture() {
      const [wallet, other] = await ethers.getSigners();
      const { token0, token1 } = await tokensFixture();
      const poolDeployerAddress = getCreateAddress({ from: wallet.address, nonce: await ethers.provider.getTransactionCount(wallet.address) + 1 });
      const core = await (await ethers.getContractFactory(FACTORY.abi, FACTORY.bytecode)).deploy(poolDeployerAddress) as any;
      await (await ethers.getContractFactory(DEPLOYER.abi, DEPLOYER.bytecode)).deploy(core, await core.poolExtension());
      const wnative = await (await ethers.getContractFactory(WNATIVE.abi, WNATIVE.bytecode)).deploy();
      const entryPoint = await (await ethers.getContractFactory(ENTRY_POINT.abi, ENTRY_POINT.bytecode)).deploy(core);
      await core.grantRole(await core.CUSTOM_POOL_DEPLOYER(), entryPoint);
      await core.grantRole(await core.POOLS_ADMINISTRATOR_ROLE(), entryPoint);

      const factoryArtifact = custom ? await pinnedCustomPluginFactory() : await pinnedMockTimePluginFactory();
      const factoryImpl = await factoryArtifact.deploy();
      const initData = factoryArtifact.interface.encodeFunctionData('initialize', [
        custom ? await entryPoint.getAddress() : await core.getAddress(), await factoryImpl.getAddress(), DEFAULT_FEE_CONFIGURATION,
      ]);
      const { proxyAddress } = await deployTransparentProxy(await factoryImpl.getAddress(), wallet, initData);
      const factory = factoryArtifact.attach(proxyAddress) as any;
      const implementations = await deployImplementations();
      const pluginImpl = await (await ethers.getContractFactory('AlgebraUpgradeablePlugin')).deploy(core, factory, ...moduleArgs(implementations));
      const manager = await deployLimitOrderManager(await core.getAddress(), proxyAddress, await wnative.getAddress(), ZeroAddress);
      const registry = await (await ethers.getContractFactory('MockSecurityRegistry')).deploy();
      await factory.setLimitOrderManager(manager);
      await factory.setSecurityRegistry(registry);
      await factory.setFarmingAddress(wallet.address);
      await factory.upgradePlugins(pluginImpl);
      if (custom) await factory.createCustomPool(wallet.address, token0, token1, '0x');
      else {
        await core.setDefaultPluginFactory(factory);
        await core.createPool(token0, token1, '0x');
      }
      const poolAddress = custom
        ? await core.customPoolByPair(factory, token0, token1)
        : await core.poolByPair(token0, token1);
      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', await factory.pluginByPool(pool));
      await pool.initialize(encodePriceSqrt(1, 1));
      const incentive = await (await ethers.getContractFactory('MockDirectionVirtualPool')).deploy();
      await plugin.setIncentive(incentive);
      const callee = await (await ethers.getContractFactory(CALLEE.abi, CALLEE.bytecode)).deploy() as any;
      for (const token of [token0, token1]) {
        await token.approve(manager, 2n ** 255n);
        await token.approve(callee, 2n ** 255n);
      }
      await callee.mint(pool, wallet.address, -600, 600, 10n ** 10n);
      const poolKey = { token0: await token0.getAddress(), token1: await token1.getAddress(), deployer: custom ? proxyAddress : ZeroAddress };
      return { wallet, other, core, factory, manager, registry, pool, plugin, incentive, callee, token0, token1, wnative, poolKey };
    }

    it('deploys the manager artifact and copies it into the plugin before pool initialization', async () => {
      const f = await loadFixture(fixture);
      expect(await f.plugin.limitOrderManager()).to.eq(await f.manager.getAddress());
      expect(await f.factory.limitOrderManager()).to.eq(await f.manager.getAddress());
      expect(await f.plugin.getActiveModuleNames()).to.include('Limit Order Plugin').and.not.include('ALM Plugin');
      expect((await f.pool.globalState()).pluginConfig).to.eq(await f.plugin.defaultPluginConfig());
    });

    for (const zeroForOne of [true, false]) {
      it(`fills and withdraws an order selling token${zeroForOne ? '0' : '1'} alongside Security and Farming`, async () => {
        const f = await loadFixture(fixture);
        const tickLower = zeroForOne ? 60 : -120;
        await f.manager.place(f.poolKey, tickLower, zeroForOne, 10n ** 8n);
        if (zeroForOne) await f.callee.swapToHigherSqrtPrice(f.pool, encodePriceSqrt(102, 100), f.wallet.address);
        else await f.callee.swapToLowerSqrtPrice(f.pool, encodePriceSqrt(100, 102), f.wallet.address);
        expect((await f.manager.epochInfos(1)).filled).to.eq(true);
        expect(await f.incentive.crossToCount()).to.eq(1);
        const output = zeroForOne ? f.token1 : f.token0;
        const balance = await output.balanceOf(f.wallet.address);
        await f.manager.withdraw(1, f.wallet.address);
        expect(await output.balanceOf(f.wallet.address)).to.be.gt(balance);
        expect((await f.manager.epochInfos(1)).liquidityTotal).to.eq(0);
        expect(await f.token0.balanceOf(f.manager)).to.eq(0);
        expect(await f.token1.balanceOf(f.manager)).to.eq(0);
      });
    }

    it('cancels an order while Security permits burns only', async () => {
      const f = await loadFixture(fixture);
      await f.manager.place(f.poolKey, 60, true, 10n ** 8n);
      await f.registry.setPoolStatus(f.pool, 1);
      await expect(f.callee.swapToHigherSqrtPrice(f.pool, encodePriceSqrt(102, 100), f.wallet.address))
        .to.be.revertedWithCustomError(f.plugin, 'BurnOnly');
      const balance = await f.token0.balanceOf(f.other.address);
      await f.manager.kill(f.poolKey, 60, 120, 10n ** 8n, true, f.other.address);
      expect(await f.token0.balanceOf(f.other.address)).to.be.gt(balance);
    });

    it('restricts factory configuration and leaves existing plugins on their manager', async () => {
      const f = await loadFixture(fixture);
      await expect(f.factory.connect(f.other).setLimitOrderManager(ZeroAddress)).to.be.revertedWithCustomError(f.factory, 'OnlyAdministrator');
      await expect(f.factory.setLimitOrderManager(ZeroAddress)).to.emit(f.factory, 'LimitOrderManager').withArgs(ZeroAddress);
      expect(await f.plugin.limitOrderManager()).to.eq(await f.manager.getAddress());
      await expect(f.manager.afterSwap(f.pool, false, 120)).to.be.revertedWithCustomError(f.manager, 'NotPlugin');
    });

    it('reuses a manager only when all deployment immutables match', async () => {
      const f = await loadFixture(fixture);
      const args = [await f.core.getAddress(), await f.factory.getAddress(), await f.wnative.getAddress(), await f.manager.getAddress()] as const;
      expect(await (await deployLimitOrderManager(...args)).getAddress()).to.eq(await f.manager.getAddress());
      try {
        await deployLimitOrderManager(args[0], f.other.address, args[2], args[3]);
        expect.fail('expected a mismatched factory to be rejected');
      } catch (error: any) {
        expect(error.message).to.include('immutables do not match');
      }
    });
  });
}
