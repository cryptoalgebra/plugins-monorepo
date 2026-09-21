import { Wallet, ZeroAddress, getCreateAddress } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from '@cryptoalgebra/test-utils/expect';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { tokensFixture } from '@cryptoalgebra/test-utils/externalFixtures';
import { encodePriceSqrt } from '@cryptoalgebra/test-utils/utilities';
import { abi as FACTORY_ABI, bytecode as FACTORY_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json';
import {
  abi as POOL_DEPLOYER_ABI,
  bytecode as POOL_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';
import WNativeToken from './contracts/WNativeToken.json';

describe('LimitOrderManager msgSender', () => {
  let wallet: Wallet, other: Wallet;

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  async function fixture() {
    const { token0, token1 } = await tokensFixture();
    const [deployer] = await ethers.getSigners();

    const poolDeployerAddress = getCreateAddress({
      from: deployer.address,
      nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1,
    });
    const factory: any = await (await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE)).deploy(poolDeployerAddress);
    const poolDeployer: any = await (await ethers.getContractFactory(POOL_DEPLOYER_ABI, POOL_DEPLOYER_BYTECODE)).deploy(factory, factory);
    const wnative: any = await (await ethers.getContractFactory(WNativeToken.abi, WNativeToken.bytecode)).deploy();

    const pluginFactory: any = await (await ethers.getContractFactory('MockMsgSenderPluginFactory')).deploy(factory);
    await factory.setDefaultPluginFactory(pluginFactory);

    const loModule: any = await (await ethers.getContractFactory('LimitOrderManager')).deploy(wnative, poolDeployer, pluginFactory, factory);

    await factory.createPool(token0, token1, ZeroAddress);
    const pool: any = await ethers.getContractAt('IAlgebraPool', await factory.poolByPair(token0, token1));
    await pool.initialize(encodePriceSqrt(1, 1));

    const plugin: any = await ethers.getContractAt('MockMsgSenderPlugin', await pluginFactory.pluginByPool(pool));

    for (const token of [token0, token1]) {
      await (token as any).transfer(other.address, 10n ** 10n);
      await (token as any).approve(loModule, 2n ** 255n);
      await (token as any).connect(other).approve(loModule, 2n ** 255n);
    }

    const poolKey = { token0: await token0.getAddress(), token1: await token1.getAddress(), deployer: ZeroAddress };
    return { loModule, plugin, poolKey };
  }

  it('msgSender is zero when no call is in progress', async () => {
    const { loModule } = await loadFixture(fixture);
    expect(await loModule.msgSender()).to.be.eq(ZeroAddress);
  });

  it('plugin sees the real caller on place, and it is cleared afterwards', async () => {
    const { loModule, plugin, poolKey } = await loadFixture(fixture);
    expect(await plugin.lastModifyPositionSender()).to.be.eq(ZeroAddress);

    await loModule.place(poolKey, -60, false, 10n ** 8n);

    expect(await plugin.lastModifyPositionSender()).to.be.eq(wallet.address);
    expect(await loModule.msgSender()).to.be.eq(ZeroAddress);
  });

  it('plugin sees the connected signer, not the manager', async () => {
    const { loModule, plugin, poolKey } = await loadFixture(fixture);

    await loModule.connect(other).place(poolKey, -60, false, 10n ** 8n);

    const reported = await plugin.lastModifyPositionSender();
    expect(reported).to.be.eq(other.address);
    expect(reported).to.not.be.eq(await loModule.getAddress());
  });

  it('is cleared when place reverts', async () => {
    const { loModule, poolKey } = await loadFixture(fixture);

    await expect(loModule.place(poolKey, -60, false, 0)).to.be.revertedWithCustomError(loModule, 'ZeroLiquidity');
    expect(await loModule.msgSender()).to.be.eq(ZeroAddress);
  });
});
