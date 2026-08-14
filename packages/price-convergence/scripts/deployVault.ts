import { ethers, network } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Fill these before running the script.
const POOL = "0x25827078A91d0875376A8A9F1BCfB35827Ce0d4f";
const ERC4626_VAULT = "0x4db3fBA9958F7eE9715875E485cEae299714029C";
const FACTORY = "0x285C74f3d01296F96c5d3858ab482f707e8Bfdfc"; // Leave zero to read factory from POOL.
const PRICE_CONVERGENCE_PLUGIN = "0x61a2CdA69F3AFE2D976F777e4f820E278451500a"; // Optional: plugin proxy address.

// Leave zero to grant to the deployer.
const VAULT_MANAGER = ZERO_ADDRESS;
const REBALANCER = "0x00009cc27c811a3e0FdD2Fd737afCc721B67eE8e";
const PLUGIN_MANAGER = ZERO_ADDRESS;
const GRANT_ROLES = true;

const FULL_RANGE_LIQUIDITY = 1_000n;
const TWAP_PERIOD = 120;
const SET_REBALANCE_ENTRYPOINT = true;
const DEPLOY_PLUGIN_IMPLEMENTATION = false;

const DEPLOY_CONFIRMATIONS = 1;
const DEPLOY_TX_DELAY_MS = 2_000;

type TxLike = { wait: (confirmations?: number) => Promise<unknown> };
type Deployable = {
  waitForDeployment: () => Promise<unknown>;
  deploymentTransaction?: () => TxLike | null;
};

const roleManagerAbi = [
  "function grantRole(bytes32 role, address account)",
  "function hasRoleOrOwner(bytes32 role, address account) view returns (bool)",
];

function requireAddress(value: string, name: string) {
  if (!ethers.isAddress(value) || value === ZERO_ADDRESS) {
    throw new Error(`${name} must be set before running the script`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeployment(contract: Deployable) {
  const tx = contract.deploymentTransaction?.();
  if (tx) {
    await tx.wait(DEPLOY_CONFIRMATIONS);
  } else {
    await contract.waitForDeployment();
  }
  if (DEPLOY_TX_DELAY_MS > 0) await sleep(DEPLOY_TX_DELAY_MS);
}

async function waitForTx(tx: TxLike) {
  await tx.wait(DEPLOY_CONFIRMATIONS);
  if (DEPLOY_TX_DELAY_MS > 0) await sleep(DEPLOY_TX_DELAY_MS);
}

async function deployContract(name: string, args: unknown[] = []) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await waitForDeployment(contract);

  const address = await contract.getAddress();
  console.log(`${name}: ${address}`);
  return contract;
}

async function grantRoleIfNeeded(
  factory: string,
  role: string,
  account: string,
  label: string,
  signer: unknown,
) {
  const roleManager = new ethers.Contract(factory, roleManagerAbi, signer);
  if (await roleManager.hasRoleOrOwner(role, account)) {
    console.log(`${label}: ${account} already authorized`);
    return;
  }

  console.log(`${label}: granting to ${account}`);
  await waitForTx(await roleManager.grantRole(role, account));
}

async function main() {
  requireAddress(POOL, "POOL");
  requireAddress(ERC4626_VAULT, "ERC4626_VAULT");

  const [deployer] = await ethers.getSigners();
  const algebraPool = await ethers.getContractAt("IAlgebraPool", POOL);
  const factory =
    FACTORY === ZERO_ADDRESS ? await algebraPool.factory() : FACTORY;

  requireAddress(factory, "factory");

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Pool: ${POOL}`);
  console.log(`Factory: ${factory}`);
  console.log(`ERC4626 vault: ${ERC4626_VAULT}`);
  console.log("");

  if (GRANT_ROLES) {
    console.log("=== Granting roles ===");
    const vaultManager =
      VAULT_MANAGER === ZERO_ADDRESS ? deployer.address : VAULT_MANAGER;
    const rebalancer =
      REBALANCER === ZERO_ADDRESS ? deployer.address : REBALANCER;
    const pluginManager =
      PLUGIN_MANAGER === ZERO_ADDRESS ? deployer.address : PLUGIN_MANAGER;

    await grantRoleIfNeeded(
      factory,
      ethers.id("PRICE_CONVERGENCE_VAULT_MANAGER"),
      vaultManager,
      "PRICE_CONVERGENCE_VAULT_MANAGER",
      deployer,
    );
    await grantRoleIfNeeded(
      factory,
      ethers.id("PRICE_CONVERGENCE_REBALANCER"),
      rebalancer,
      "PRICE_CONVERGENCE_REBALANCER",
      deployer,
    );
    if (PRICE_CONVERGENCE_PLUGIN !== ZERO_ADDRESS) {
      await grantRoleIfNeeded(
        factory,
        ethers.id("ALGEBRA_BASE_PLUGIN_MANAGER"),
        pluginManager,
        "ALGEBRA_BASE_PLUGIN_MANAGER",
        deployer,
      );
    }
    console.log("");
  }

  console.log("=== Deploying Price Convergence Vault stack ===");

  let pluginImplementationAddress: string | undefined;
  if (DEPLOY_PLUGIN_IMPLEMENTATION) {
    const pluginImplementation = await deployContract(
      "PriceConvergencePluginImplementation",
    );
    pluginImplementationAddress = await pluginImplementation.getAddress();
  }

  const vaultMath = await deployContract("VaultMath");
  const vault = await deployContract("PriceConvergenceVault", [
    POOL,
    factory,
    FULL_RANGE_LIQUIDITY,
    await vaultMath.getAddress(),
    TWAP_PERIOD,
  ]);
  const depositGuard = await deployContract(
    "PriceConvergenceVaultDepositGuard",
    [await vault.getAddress()],
  );
  const rebalanceEntrypoint = await deployContract("RebalanceEntrypoint", [
    await vault.getAddress(),
    ERC4626_VAULT,
  ]);

  if (SET_REBALANCE_ENTRYPOINT) {
    console.log("");
    console.log("=== Configuring vault ===");
    const tx = await vault.setRebalanceEntrypoint(
      await rebalanceEntrypoint.getAddress(),
    );
    await waitForTx(tx);
    console.log(
      `Vault rebalance entrypoint set: ${await rebalanceEntrypoint.getAddress()}`,
    );
  }

  if (PRICE_CONVERGENCE_PLUGIN !== ZERO_ADDRESS) {
    console.log("");
    console.log("=== Configuring price convergence plugin ===");
    const plugin = await ethers.getContractAt(
      "IPriceConvergencePlugin",
      PRICE_CONVERGENCE_PLUGIN,
    );
    const tx = await plugin.setVault(await vault.getAddress());
    await waitForTx(tx);
    console.log(`Plugin vault set: ${await vault.getAddress()}`);
  }

  console.log("");
  console.log("=== Deployment summary ===");
  console.log(
    JSON.stringify(
      {
        network: network.name,
        deployer: deployer.address,
        pool: POOL,
        factory,
        erc4626Vault: ERC4626_VAULT,
        fullRangeLiquidity: FULL_RANGE_LIQUIDITY.toString(),
        twapPeriod: TWAP_PERIOD,
        pluginImplementation: pluginImplementationAddress,
        vaultMath: await vaultMath.getAddress(),
        vault: await vault.getAddress(),
        depositGuard: await depositGuard.getAddress(),
        rebalanceEntrypoint: await rebalanceEntrypoint.getAddress(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
