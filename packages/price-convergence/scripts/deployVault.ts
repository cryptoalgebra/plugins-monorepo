import { ethers, network } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Fill these before running the script.
const POOL = "0x677deB381d39E44dE0641EaCB6E36637318043F7";
const ERC4626_VAULT = "0xFF05E1bD696900dc6A52CA35Ca61Bb1024eDa8e2";
const FACTORY = "0x53400eD24c77515397fC3A559fF1363DaB81B5c7"; // Leave zero to read factory from POOL.
const PRICE_CONVERGENCE_PLUGIN = "0xcC0B75a60E62430e0C51b8A49eF050EDfC192337"; // Optional: plugin proxy address.

// Leave zero to grant to the deployer.
const VAULT_MANAGER = ZERO_ADDRESS;
const REBALANCER = "0x00009cc27c811a3e0FdD2Fd737afCc721B67eE8e";
const PLUGIN_MANAGER = ZERO_ADDRESS;
const GRANT_ROLES = true;

// Owner of the ProxyAdmin governing the vault's proxy - the only account that can upgrade it.
// Leave zero to default to the deployer.
const PROXY_ADMIN_OWNER = ZERO_ADDRESS;

const FULL_RANGE_LIQUIDITY = 1_000n;
const TWAP_PERIOD = 120;
const SET_REBALANCE_ENTRYPOINT = true;
const DEPLOY_PLUGIN_IMPLEMENTATION = false;

const THRESHOLD_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Fill in before running.
const THRESHOLD_AMOUNT_HUMAN = "1000"; // In THRESHOLD_TOKEN's own decimals.

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

const erc20Abi = ["function decimals() view returns (uint8)"];

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

  const proxyAdminOwner =
    PROXY_ADMIN_OWNER === ZERO_ADDRESS ? deployer.address : PROXY_ADMIN_OWNER;
  const proxyAdmin = await deployContract("ProxyAdmin");
  if (proxyAdminOwner !== deployer.address) {
    await waitForTx(await proxyAdmin.transferOwnership(proxyAdminOwner));
  }

  const vaultImplementation = await deployContract("PriceConvergenceVault", [
    POOL,
    factory,
    FULL_RANGE_LIQUIDITY,
  ]);
  const initData = vaultImplementation.interface.encodeFunctionData(
    "initialize",
    [await vaultMath.getAddress(), TWAP_PERIOD],
  );
  const vaultProxy = await deployContract("TransparentUpgradeableProxy", [
    await vaultImplementation.getAddress(),
    await proxyAdmin.getAddress(),
    initData,
  ]);
  const vault = await ethers.getContractAt(
    "PriceConvergenceVault",
    await vaultProxy.getAddress(),
  );

  const depositGuard = await deployContract(
    "PriceConvergenceVaultDepositGuard",
    [await vault.getAddress()],
  );

  requireAddress(THRESHOLD_TOKEN, "THRESHOLD_TOKEN");
  const token0Address = await vault.token0();
  const token1Address = await vault.token1();
  if (THRESHOLD_TOKEN !== token0Address && THRESHOLD_TOKEN !== token1Address) {
    throw new Error(
      `THRESHOLD_TOKEN ${THRESHOLD_TOKEN} is neither of the vault's tokens ` +
        `(${token0Address}, ${token1Address})`,
    );
  }
  const thresholdTokenContract = new ethers.Contract(
    THRESHOLD_TOKEN,
    erc20Abi,
    deployer,
  );
  const thresholdDecimals = Number(await thresholdTokenContract.decimals());
  const rebalanceThreshold = ethers.parseUnits(
    THRESHOLD_AMOUNT_HUMAN,
    thresholdDecimals,
  );
  console.log(
    `Threshold token: ${THRESHOLD_TOKEN} (${thresholdDecimals} decimals)`,
  );
  console.log(
    `Rebalance threshold: ${THRESHOLD_AMOUNT_HUMAN} ` +
      `(${rebalanceThreshold.toString()} raw units)`,
  );

  const rebalanceEntrypoint = await deployContract("RebalanceEntrypoint", [
    await vault.getAddress(),
    ERC4626_VAULT,
    THRESHOLD_TOKEN,
    rebalanceThreshold,
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
        proxyAdmin: await proxyAdmin.getAddress(),
        proxyAdminOwner,
        vaultImplementation: await vaultImplementation.getAddress(),
        vault: await vault.getAddress(),
        depositGuard: await depositGuard.getAddress(),
        thresholdToken: THRESHOLD_TOKEN,
        rebalanceThreshold: rebalanceThreshold.toString(),
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
