import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// The manager takes the base plugin factory as an immutable, so deploy the plugin factory first
// (default-plugin/scripts/deployUpgradeable.ts) and paste its PROXY address here.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const config = {
  // Algebra Core Factory. poolDeployer is read from it.
  algebraFactory: "0xd265f57c36AC60d3F7931eC5c7396966F0C246A7", // Ethereum mainnet

  // AlgebraUpgradeablePluginFactory proxy that creates the plugins using this manager.
  pluginFactory: "0xB496AAAeD649a640BD5e3c99E45a67991F9D587F",

  // Wrapped native token (WETH on Ethereum mainnet). Used for native-token limit orders.
  wNativeToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",

  // Call setLimitOrderManager on the plugin factory after deploying (needs the factory administrator role).
  setOnPluginFactory: true,

  // Register an already deployed manager instead of deploying a new one. Leave empty to deploy.
  existingManager: "",

  confirmations: 1,
  // Public RPCs are load-balanced, so the next tx can read a stale nonce from a lagging node
  txDelayMs: 5_000,
};

// ============= HELPERS =============

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitTx(tx: any, label: string) {
  console.log(`${label} (tx: ${tx.hash})`);
  await tx.wait(config.confirmations);
  if (config.txDelayMs > 0) await sleep(config.txDelayMs);
}

function requireAddress(value: string, name: string) {
  if (!ethers.isAddress(value) || value === ZERO_ADDRESS) {
    throw new Error(`Set config.${name} before deploying`);
  }
}

// ============= MAIN =============

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);
  console.log("");

  requireAddress(config.algebraFactory, "algebraFactory");
  requireAddress(config.pluginFactory, "pluginFactory");
  requireAddress(config.wNativeToken, "wNativeToken");

  const algebraFactory = await ethers.getContractAt("IAlgebraFactory", config.algebraFactory);
  const poolDeployer = await algebraFactory.poolDeployer();
  console.log(`poolDeployer: ${poolDeployer}`);
  console.log("");

  // ============= 1. DEPLOY =============

  let managerAddress = config.existingManager;

  if (managerAddress === "") {
    console.log("=== Deploying Limit Order Manager ===");
    const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
    const manager = await LimitOrderManager.deploy(
      config.wNativeToken,
      poolDeployer,
      config.pluginFactory,
      config.algebraFactory,
    );
    await manager.waitForDeployment();
    await sleep(config.txDelayMs);
    managerAddress = await manager.getAddress();
    console.log(`LimitOrderManager: ${managerAddress}`);
  } else {
    console.log(`=== Reusing Limit Order Manager at ${managerAddress} ===`);
  }
  console.log("");

  // ============= 2. REGISTER ON THE PLUGIN FACTORY =============

  if (config.setOnPluginFactory) {
    console.log("=== Registering on the plugin factory ===");
    // Minimal ABI on purpose: the factory's artifact belongs to the default-plugin package.
    const pluginFactory = new ethers.Contract(
      config.pluginFactory,
      ["function setLimitOrderManager(address newLimitOrderManager)", "function limitOrderManager() view returns (address)"],
      deployer,
    );
    // Plugins created from here on pick the manager up in their initialize call.
    // Plugins created earlier keep whatever manager they were initialized with.
    await waitTx(await pluginFactory.setLimitOrderManager(managerAddress), "setLimitOrderManager");
    console.log("");
  }

  // ============= SUMMARY =============

  console.log("========================================");
  console.log("=== DEPLOYMENT COMPLETE ===");
  console.log("========================================");
  console.log("");
  console.log("LimitOrderManager:", managerAddress);
  console.log("");
  console.log("Next steps:");
  console.log("- setRouterAllowed(manager, true) on each permissioned pool's plugin, since the manager calls pools directly");
  console.log("- exempt the manager on tokens that check transfers themselves");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
