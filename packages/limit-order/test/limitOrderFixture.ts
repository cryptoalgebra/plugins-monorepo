import { ethers } from 'hardhat';
import { abi as FACTORY_ABI, bytecode as FACTORY_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json';
import PLUGIN_FACTORY_ARTIFACT from './pinned/UpgradeableLimitOrderTestPluginFactory.json';
import {
  abi as TEST_CALLEE_ABI,
  bytecode as TEST_CALLEE_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/TestAlgebraCallee.sol/TestAlgebraCallee.json';
import {
  abi as POOL_DEPLOYER_ABI,
  bytecode as POOL_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';
import {
  abi as POOL_ABI,
  bytecode as POOL_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json';
import { LimitOrderManager, IWNativeToken } from '../typechain';
import { tokensFixture } from 'test-utils/externalFixtures';
import { getCreateAddress } from 'ethers';
import {AlgebraPool, AlgebraFactory, TestAlgebraCallee, AlgebraPoolDeployer, TestERC20 } from '@cryptoalgebra/integral-core/typechain';
import WNativeToken from './contracts/WNativeToken.json';
type Fixture<T> = () => Promise<T>;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';


// Monday, October 5, 2020 9:00:00 AM GMT-05:00
export const TEST_POOL_START_TIME = 1601906400;
export const TEST_POOL_DAY_BEFORE_START = 1601906400 - 24 * 60 * 60;

interface LimitOrderPluginFixture{
  loModule: LimitOrderManager;
  token0: TestERC20;
  token1: TestERC20;
  wnative: IWNativeToken;
  pool: AlgebraPool;
  pool0Wnative: AlgebraPool;
  poolWnative1: AlgebraPool;
  swapTarget: TestAlgebraCallee;
 }


// The specs build pool keys token0/wnative and wnative/token1, and a PoolKey has to be sorted,
// so the fixture needs token0 < wnative < token1. A deployment address cannot be chosen, so redeploy
// until one lands between the two tokens. Takes ~8 attempts, and loadFixture runs the fixture once.
const MAX_WNATIVE_DEPLOY_ATTEMPTS = 200;

async function deployWNativeBetween(token0: string, token1: string): Promise<IWNativeToken> {
  const wnativeFactory = await ethers.getContractFactory(WNativeToken.abi, WNativeToken.bytecode);

  const lower = BigInt(token0) < BigInt(token1) ? BigInt(token0) : BigInt(token1);
  const upper = BigInt(token0) < BigInt(token1) ? BigInt(token1) : BigInt(token0);

  for (let attempt = 0; attempt < MAX_WNATIVE_DEPLOY_ATTEMPTS; attempt++) {
    const deployed = await wnativeFactory.deploy();
    const address = BigInt(await deployed.getAddress());
    if (address > lower && address < upper) return deployed as any as IWNativeToken;
  }

  throw new Error('could not deploy wnative between token0 and token1');
}

export const limitOrderPluginFixture: Fixture<LimitOrderPluginFixture> = async function (): Promise<LimitOrderPluginFixture> {

  const { token0, token1 } = await tokensFixture();

  const [deployer] = await ethers.getSigners();
  // precompute
  const poolDeployerAddress = getCreateAddress({
    from: deployer.address,
    nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1,
  });

  const factoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
  const factory = (await factoryFactory.deploy(poolDeployerAddress)) as any as AlgebraFactory;

  const poolDeployerFactory = await ethers.getContractFactory(POOL_DEPLOYER_ABI, POOL_DEPLOYER_BYTECODE);
  const poolDeployer = (await poolDeployerFactory.deploy(factory, factory)) as any as AlgebraPoolDeployer;

  const wnative = await deployWNativeBetween(await token0.getAddress(), await token1.getAddress());

  const calleeContractFactory = await ethers.getContractFactory(TEST_CALLEE_ABI, TEST_CALLEE_BYTECODE);
  const swapTarget = (await calleeContractFactory.deploy()) as any as TestAlgebraCallee;

  const poolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);

  // Pinned bytecode on purpose. This harness builds the plugin proxy with `new AlgebraPluginProxy`,
  // and the plugin reads the pool address out of that proxy's runtime code at a fixed offset. A
  // coverage build compiles without the optimizer, which moves the immutable and makes every pool
  // driven case revert OnlyPool(). See packages/test-utils/pinnedProxy.ts for the full story.
  const pluginFactoryFactory = await ethers.getContractFactory(
    PLUGIN_FACTORY_ARTIFACT.abi,
    PLUGIN_FACTORY_ARTIFACT.bytecode
  );
  const pluginFactory = (await pluginFactoryFactory.deploy(factory)) as any;

  const loModuleFactory = await ethers.getContractFactory('LimitOrderManager');
  const loModule = (await loModuleFactory.deploy(wnative, poolDeployer, pluginFactory, factory)) as any as LimitOrderManager

  await pluginFactory.setLimitOrderManager(loModule);
  await factory.setDefaultPluginFactory(pluginFactory)

  await factory.createPool(token0, token1, ZERO_ADDRESS);

  const poolAddress = await factory.poolByPair(token0, token1);
  const pool = (poolFactory.attach(poolAddress)) as any as AlgebraPool;

  await factory.createPool(token0, wnative, ZERO_ADDRESS);
  const poolAddress0Wnative = await factory.poolByPair(token0, wnative);
  const pool0Wnative = (poolFactory.attach(poolAddress0Wnative)) as any as AlgebraPool;

  await pluginFactory.setLimitOrderManager(ZERO_ADDRESS);

  await factory.createPool(wnative, token1, ZERO_ADDRESS);
  const poolAddressWnative1 = await factory.poolByPair(wnative, token1);
  const poolWnative1 = (poolFactory.attach(poolAddressWnative1)) as any as AlgebraPool;

  return {
    loModule,
    token0,
    token1,
    wnative,
    pool,
    pool0Wnative,
    poolWnative1,
    swapTarget
  };
};