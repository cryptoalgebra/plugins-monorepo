import { ethers } from "hardhat";
import { algebraPoolDeployerMockFixture } from "../../../test-utils/externalFixtures";

export const Q96 = 1n << 96n;
export const DEPOSIT_AMOUNT = 10n ** 18n;
export const FULL_RANGE_LIQUIDITY = 1_000n;
export const MIN_SHARES = 1_000_000n;
export const BEFORE_SWAP_FLAG = 1;

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
  const vaultMath = await VaultMath.deploy(core.factory.target);
  const Vault = await ethers.getContractFactory("PriceConvergenceVault");
  const vault = await Vault.deploy(
    pool.target,
    core.factory.target,
    FULL_RANGE_LIQUIDITY,
    vaultMath.target,
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
    role,
  };
}
