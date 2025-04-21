import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json';
import {
  abi as TEST_CALLEE_ABI,
  bytecode as TEST_CALLEE_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/TestAlgebraCallee.sol/TestAlgebraCallee.json';
import {
  abi as POOL_DEPLOYER_ABI,
  bytecode as POOL_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/MockTimeAlgebraPoolDeployer.sol/MockTimeAlgebraPoolDeployer.json';
import {
  abi as POOL_ABI,
  bytecode as POOL_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/MockTimeAlgebraPool.sol/MockTimeAlgebraPool.json';
import {
  abi as COM_VAULT_DEPLOYER_ABI,
  bytecode as COM_VAULT_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraCommunityVault.sol/AlgebraCommunityVault.json';
import {
  abi as COM_VAULT_STUB_DEPLOYER_ABI,
  bytecode as COM_VAULT_STUB_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraVaultFactoryStub.sol/AlgebraVaultFactoryStub.json';
import {
  abi as ENTRYPOINT_ABI,
  bytecode as ENTRYPOINT_BYTECODE,
} from '@cryptoalgebra/integral-periphery/artifacts/contracts/AlgebraCustomPoolEntryPoint.sol/AlgebraCustomPoolEntryPoint.json';
import {
  abi as POOL_DEPLOYER_CORE_ABI,
  bytecode as POOL_DEPLOYER_CORE_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';

import { ethers } from 'hardhat';
import {
  MockTimeAlgebraPoolDeployer,
  AlgebraPoolDeployer,
  AlgebraFactory,
  AlgebraCommunityVault,
  TestAlgebraCallee,
  MockTimeAlgebraPool,
  TestERC20,
} from '@cryptoalgebra/integral-core/typechain';

import {
  AlgebraCustomPoolEntryPoint
} from '@cryptoalgebra/integral-periphery/typechain';
import { getCreateAddress } from 'ethers';

interface TokensFixture {
  token0: TestERC20;
  token1: TestERC20;
}

export async function tokensFixture(): Promise<TokensFixture> {
  const tokenFactory = await ethers.getContractFactory('TestERC20');
  const tokenA = (await tokenFactory.deploy(2n ** 255n)) as any as TestERC20 & { address: string };
  const tokenB = (await tokenFactory.deploy(2n ** 255n)) as any as TestERC20 & { address: string };

  tokenA.address = await tokenA.getAddress();
  tokenB.address = await tokenB.getAddress();

  const [token0, token1] = [tokenA, tokenB].sort((_tokenA, _tokenB) => (_tokenA.address.toLowerCase() < _tokenB.address.toLowerCase() ? -1 : 1));

  return { token0, token1 };
}

interface MockPoolDeployerFixture extends TokensFixture {
  poolDeployer: MockTimeAlgebraPoolDeployer;
  swapTargetCallee: TestAlgebraCallee;
  factory: AlgebraFactory;
  createPool(firstToken?: TestERC20, secondToken?: TestERC20): Promise<MockTimeAlgebraPool>;
}
export const algebraPoolDeployerMockFixture: () => Promise<MockPoolDeployerFixture> = async () => {
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
  const poolDeployer = (await poolDeployerFactory.deploy()) as any as MockTimeAlgebraPoolDeployer;

  const ADMIN_ROLE = await factory.POOLS_ADMINISTRATOR_ROLE();
  await factory.grantRole(ADMIN_ROLE, poolDeployer);

  const vaultFactory = await ethers.getContractFactory(COM_VAULT_DEPLOYER_ABI, COM_VAULT_DEPLOYER_BYTECODE);
  const vault = (await vaultFactory.deploy(factory, deployer.address)) as any as AlgebraCommunityVault;

  const vaultFactoryStubFactory = await ethers.getContractFactory(COM_VAULT_STUB_DEPLOYER_ABI, COM_VAULT_STUB_DEPLOYER_BYTECODE);
  const vaultFactoryStub = await vaultFactoryStubFactory.deploy(vault);

  await factory.setVaultFactory(vaultFactoryStub);

  const calleeContractFactory = await ethers.getContractFactory(TEST_CALLEE_ABI, TEST_CALLEE_BYTECODE);
  const swapTargetCallee = (await calleeContractFactory.deploy()) as any as TestAlgebraCallee;

  const MockTimeAlgebraPoolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);

  return {
    poolDeployer,
    swapTargetCallee,
    token0,
    token1,
    factory,
    createPool: async (firstToken = token0, secondToken = token1) => {
      await poolDeployer.deployMock(factory, firstToken, secondToken);

      const sortedTokens =
        BigInt(await firstToken.getAddress()) < BigInt(await secondToken.getAddress())
          ? [await firstToken.getAddress(), await secondToken.getAddress()]
          : [await secondToken.getAddress(), await firstToken.getAddress()];
      const poolAddress = await poolDeployer.computeAddress(sortedTokens[0], sortedTokens[1]);
      return MockTimeAlgebraPoolFactory.attach(poolAddress) as any as MockTimeAlgebraPool;
    },
  };
};



interface algebraDeployFixture extends TokensFixture {
  poolDeployer: AlgebraPoolDeployer;
  factory: AlgebraFactory;
  entryPoint: AlgebraCustomPoolEntryPoint;
}
export const algebraCoreFixture: () => Promise<algebraDeployFixture> = async () => {
  const { token0, token1 } = await tokensFixture();

  const [deployer] = await ethers.getSigners();
  // precompute
  const poolDeployerAddress = getCreateAddress({
    from: deployer.address,
    nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1,
  });

  const factoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
  const factory = (await factoryFactory.deploy(poolDeployerAddress)) as any as AlgebraFactory;

  const poolDeployerFactory = await ethers.getContractFactory(POOL_DEPLOYER_CORE_ABI, POOL_DEPLOYER_CORE_BYTECODE);
  const poolDeployer = (await poolDeployerFactory.deploy(factory)) as any as AlgebraPoolDeployer;

  const ADMIN_ROLE = await factory.POOLS_ADMINISTRATOR_ROLE();
  await factory.grantRole(ADMIN_ROLE, poolDeployer);

  const entrypointFactory = await ethers.getContractFactory(ENTRYPOINT_ABI, ENTRYPOINT_BYTECODE);
  const entryPoint = await entrypointFactory.deploy(factory) as any as AlgebraCustomPoolEntryPoint;
  
  let customPoolDeployerRole = await factory.CUSTOM_POOL_DEPLOYER()
  let poolAdministratorRole = await factory.POOLS_ADMINISTRATOR_ROLE()
  await factory.grantRole(customPoolDeployerRole, await entryPoint.getAddress());
  await factory.grantRole(poolAdministratorRole, await entryPoint.getAddress());

  return {
    poolDeployer,
    token0,
    token1,
    factory,
    entryPoint
  };
};
