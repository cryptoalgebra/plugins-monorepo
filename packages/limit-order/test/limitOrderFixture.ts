import { ethers } from 'hardhat';
import { abi as FACTORY_ABI, bytecode as FACTORY_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json';
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
import { LimitOrderTestPluginFactory, LimitOrderManager, IWNativeToken } from '../typechain';
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

  const wnativeFactory = await ethers.getContractFactory(WNativeToken.abi, WNativeToken.bytecode);
  const wnative = (await wnativeFactory.deploy()) as any as IWNativeToken & { address: string};

  const calleeContractFactory = await ethers.getContractFactory(TEST_CALLEE_ABI, TEST_CALLEE_BYTECODE);
  const swapTarget = (await calleeContractFactory.deploy()) as any as TestAlgebraCallee;

  const poolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);

  const pluginFactoryFactory = await ethers.getContractFactory('LimitOrderTestPluginFactory');
  const pluginFactory = (await pluginFactoryFactory.deploy(factory)) as any as LimitOrderTestPluginFactory;

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