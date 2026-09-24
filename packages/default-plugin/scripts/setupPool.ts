import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Creates a plugin on the new plugin factory, attaches it to the pool (replacing whatever
// plugin is there) and initializes the pool at the given price.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const config = {
  // Algebra Core Factory
  algebraFactory: "0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04",

  // AlgebraUpgradeablePluginFactory proxy that should own the pool's plugin
  pluginFactory: "0xD440895ADD415C2e809416b5a092d60106f75A0B",

  // Pool tokens, any order.
  tokenA: "0x5F8a1C74C112865BD05dbe4752C7608332719062", // deJAAA
  tokenB: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8", // USDG

  // Initial price: how much of the other token one pricedToken costs, in human units.
  // Token order and decimals are handled below.
  pricedToken: "0x5F8a1C74C112865BD05dbe4752C7608332719062", // deJAAA
  priceInQuote: "1.046", // USDG per deJAAA

  // Replace an already attached plugin. Off by default so a misconfigured run cannot
  // silently detach a live pool's plugin.
  replaceExistingPlugin: true,

  // Tick spacing to apply after initialization. 0 keeps whatever the factory default set.
  // initialize() rewrites tick spacing from the factory defaults, so this runs after it.
  tickSpacing: 1,


  confirmations: 1,
  txDelayMs: 2_000,
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

/// @dev Parses "158.73" into a fraction so no floating point math touches the price.
function parseDecimal(value: string): { numerator: bigint; denominator: bigint } {
  const [whole, fraction = ""] = value.trim().split(".");
  if (!/^\d+$/.test(whole) || (fraction !== "" && !/^\d+$/.test(fraction))) {
    throw new Error(`Invalid decimal price: ${value}`);
  }
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}

function sqrtBigInt(value: bigint): bigint {
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (value / y + y) / 2n;
  }
  return x;
}

/// @dev sqrtPriceX96 for "token1 per token0" in raw units, i.e. the human price scaled by the decimal difference.
function computeSqrtPriceX96(
  priceNumerator: bigint,
  priceDenominator: bigint,
  decimals0: bigint,
  decimals1: bigint,
): bigint {
  return sqrtBigInt((priceNumerator * 10n ** decimals1 * 2n ** 192n) / (priceDenominator * 10n ** decimals0));
}

// ============= MAIN =============

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

  if (!ethers.isAddress(config.pluginFactory) || config.pluginFactory === ZERO_ADDRESS) {
    throw new Error("Set config.pluginFactory before running");
  }

  const algebraFactory = await ethers.getContractAt("IAlgebraFactory", config.algebraFactory);
  const pluginFactory = await ethers.getContractAt("AlgebraUpgradeablePluginFactory", config.pluginFactory);

  // ============= 1. RESOLVE POOL AND TOKEN ORDER =============

  const poolAddress = await algebraFactory.poolByPair(config.tokenA, config.tokenB);
  if (poolAddress === ZERO_ADDRESS) throw new Error("Pool does not exist for this pair");

  const pool = await ethers.getContractAt("IAlgebraPool", poolAddress);
  const token0 = await pool.token0();
  const token1 = await pool.token1();

  const erc20 = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];
  const token0Contract = new ethers.Contract(token0, erc20, ethers.provider);
  const token1Contract = new ethers.Contract(token1, erc20, ethers.provider);
  const decimals0 = BigInt(await token0Contract.decimals());
  const decimals1 = BigInt(await token1Contract.decimals());
  const symbol0 = await token0Contract.symbol();
  const symbol1 = await token1Contract.symbol();

  console.log(`Pool: ${poolAddress}`);
  console.log(`token0: ${symbol0} ${token0} (${decimals0} decimals)`);
  console.log(`token1: ${symbol1} ${token1} (${decimals1} decimals)`);
  console.log("");

  // ============= 2. PRICE =============

  const stateBefore = await pool.globalState();
  const needsInitialization = stateBefore.price === 0n;

  let sqrtPriceX96 = 0n;
  if (needsInitialization) {
    if (config.priceInQuote === "") throw new Error("Pool is not initialized: set config.priceInQuote");

    const priced = ethers.getAddress(config.pricedToken);
    if (priced !== ethers.getAddress(token0) && priced !== ethers.getAddress(token1)) {
      throw new Error("pricedToken is neither of the pool's tokens");
    }

    const { numerator, denominator } = parseDecimal(config.priceInQuote);
    // The pool price is always token1 per token0, so invert when the priced token is token1.
    const pricedIsToken0 = priced === ethers.getAddress(token0);
    sqrtPriceX96 = pricedIsToken0
      ? computeSqrtPriceX96(numerator, denominator, decimals0, decimals1)
      : computeSqrtPriceX96(denominator, numerator, decimals0, decimals1);
    if (sqrtPriceX96 === 0n) throw new Error("Computed sqrtPriceX96 is zero, check the price and decimals");

    console.log(
      `Price: 1 ${pricedIsToken0 ? symbol0 : symbol1} = ${config.priceInQuote} ${pricedIsToken0 ? symbol1 : symbol0}`,
    );
    console.log(`sqrtPriceX96: ${sqrtPriceX96}`);
    console.log("");
  }

  // ============= 3. PLUGIN =============

  let pluginAddress = await pluginFactory.pluginByPool(poolAddress);

  if (pluginAddress === ZERO_ADDRESS) {
    console.log("=== Creating plugin ===");
    await waitTx(await pluginFactory.createPluginForExistingPool(token0, token1), "createPluginForExistingPool");
    pluginAddress = await pluginFactory.pluginByPool(poolAddress);
    console.log(`Plugin: ${pluginAddress}`);
  } else {
    console.log(`=== Plugin already created by this factory: ${pluginAddress} ===`);
  }
  console.log("");

  const plugin = await ethers.getContractAt("AlgebraUpgradeablePlugin", pluginAddress);

  // ============= 4. ATTACH PLUGIN TO POOL =============

  const currentPlugin = await pool.plugin();

  if (currentPlugin.toLowerCase() === pluginAddress.toLowerCase()) {
    console.log("=== Plugin already attached ===");
  } else if (currentPlugin !== ZERO_ADDRESS && !config.replaceExistingPlugin) {
    throw new Error(
      `Pool already has plugin ${currentPlugin}. Set config.replaceExistingPlugin to replace it with ${pluginAddress}`,
    );
  } else {
    console.log(`=== Attaching plugin (replacing ${currentPlugin}) ===`);
    // setPlugin resets the pool's plugin config to 0.
    await waitTx(await pool.setPlugin(pluginAddress), "setPlugin");
  }

  const defaultPluginConfig = await plugin.defaultPluginConfig();
  const currentConfig = (await pool.globalState()).pluginConfig;
  if (currentConfig !== defaultPluginConfig) {
    await waitTx(await pool.setPluginConfig(defaultPluginConfig), `setPluginConfig(${defaultPluginConfig})`);
  }
  console.log("");

  // ============= 5. INITIALIZE =============

  if (needsInitialization) {
    console.log("=== Initializing pool ===");
    // beforeInitialize runs unconditionally and rewrites the plugin config, so the AFTER_INIT
    // hook that seeds the volatility oracle fires within this same call.
    await waitTx(await pool.initialize(sqrtPriceX96), `initialize(${sqrtPriceX96})`);
  } else {
    console.log(`=== Pool already initialized at sqrtPrice ${stateBefore.price} ===`);
  }
  // ============= 6. TICK SPACING =============

  // Applied last: initialize() overwrites tick spacing with the factory default.
  if (config.tickSpacing !== 0) {
    const currentTickSpacing = await pool.tickSpacing();
    if (currentTickSpacing !== BigInt(config.tickSpacing)) {
      await waitTx(await pool.setTickSpacing(config.tickSpacing), `setTickSpacing(${config.tickSpacing})`);
    } else {
      console.log(`=== Tick spacing already ${config.tickSpacing} ===`);
    }
    console.log("");
  }

  // ============= SUMMARY =============

  const state = await pool.globalState();
  const modules = await plugin.getActiveModuleNames();

  console.log("========================================");
  console.log("=== POOL READY ===");
  console.log("========================================");
  console.log("");
  console.log("Pool:        ", poolAddress);
  console.log("Plugin:      ", pluginAddress);
  console.log("Modules:     ", modules.join(", "));
  console.log("sqrtPriceX96:", state.price.toString());
  console.log("tick:        ", state.tick.toString());
  console.log("lastFee:     ", state.lastFee.toString());
  console.log("pluginConfig:", state.pluginConfig.toString(), `(expected ${defaultPluginConfig})`);
  console.log("tickSpacing: ", (await pool.tickSpacing()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
