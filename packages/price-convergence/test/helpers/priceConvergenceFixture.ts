import { ethers } from "hardhat";
import { algebraPoolDeployerMockFixture } from "../../../test-utils/externalFixtures";

export const Q96 = 1n << 96n;
export const DEPOSIT_AMOUNT = 10n ** 18n;
export const FULL_RANGE_LIQUIDITY = 1_000n;
export const MIN_SHARES = 1_000_000n;
export const BEFORE_SWAP_FLAG = 1;

/// Deploys a PriceConvergenceVault implementation behind its own dedicated
/// TransparentUpgradeableProxy + ProxyAdmin, mirroring how a real deployment wires it up -
/// pool/factory/fullRangeLiquidity are immutable (baked into the implementation), everything
/// else is set up by initialize() through the proxy.
export async function deployVaultProxy(
  poolAddress: string,
  factoryAddress: string,
  vaultMathAddress: string,
  twapPeriod: number,
  fullRangeLiquidity: bigint = FULL_RANGE_LIQUIDITY,
  // The implementation's constructor is what sets `deployer` (whoever deploys the implementation
  // - the proxy itself doesn't run a constructor), so this is who deployer() ends up reporting.
  deployerSigner?: Parameters<typeof ethers.getContractFactory>[1],
) {
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();

  const Vault = await ethers.getContractFactory(
    "PriceConvergenceVault",
    deployerSigner,
  );
  const implementation = await Vault.deploy(
    poolAddress,
    factoryAddress,
    fullRangeLiquidity,
  );

  const initData = implementation.interface.encodeFunctionData("initialize", [
    vaultMathAddress,
    twapPeriod,
  ]);

  const Proxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await Proxy.deploy(
    implementation.target,
    proxyAdmin.target,
    initData,
  );

  const vault = await ethers.getContractAt(
    "PriceConvergenceVault",
    proxy.target,
  );
  return { vault, implementation, proxyAdmin };
}

export async function deployVaultFixture() {
  const [owner, vaultManager, user, other, rebalancer] =
    await ethers.getSigners();
  const core = await algebraPoolDeployerMockFixture();
  const pool = await core.createPool();
  await pool.initialize(Q96);
  await pool.setTickSpacing(1);

  const MockOracle = await ethers.getContractFactory(
    "MockPriceConvergenceOracle",
  );
  const oracle = await MockOracle.deploy();
  await pool.setPlugin(oracle.target);
  await pool.setPluginConfig(BEFORE_SWAP_FLAG);

  const VaultMath = await ethers.getContractFactory("VaultMath");
  const vaultMath = await VaultMath.deploy();
  const { vault, implementation: vaultImplementation, proxyAdmin } =
    await deployVaultProxy(
      pool.target as string,
      core.factory.target as string,
      vaultMath.target as string,
      60,
    );

  const role = ethers.keccak256(
    ethers.toUtf8Bytes("PRICE_CONVERGENCE_VAULT_MANAGER"),
  );
  await core.factory.grantRole(role, vaultManager.address);
  await core.token0.transfer(user.address, DEPOSIT_AMOUNT * 10n);
  await core.token1.transfer(user.address, DEPOSIT_AMOUNT * 10n);

  return {
    owner,
    vaultManager,
    user,
    other,
    rebalancer,
    factory: core.factory,
    token0: core.token0,
    token1: core.token1,
    pool,
    oracle,
    vaultMath,
    vault,
    vaultImplementation,
    proxyAdmin,
    role,
    swapTargetCallee: core.swapTargetCallee,
  };
}
