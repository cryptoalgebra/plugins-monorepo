import { ethers } from "hardhat";

// ============= CONFIGURATION =============

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const config = {
  // Algebra Core Factory
  algebraFactory: "0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04",

  // AlgebraUpgradeablePluginFactory proxy
  pluginFactory: "0xc27754e939213fab4f68A5B4E75adf9568174355",

  // Pool tokens, any order.
  tokenA: "0x30987adF0B11dc698438a99BA04ec3a1AB2c7EaB", // wMSTRx
  tokenB: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8", // USDG

  // Initial price: how much of the OTHER token one pricedToken costs, in human units.
  // Decimals and token order are handled below.
  pricedToken: "0x30987adF0B11dc698438a99BA04ec3a1AB2c7EaB", // wMSTRx
  priceInQuote: "158.73",

  // setPlugin wipes the pool's plugin config, and initialize restores it through the
  // plugin's beforeInitialize hook. Set this to also write it explicitly beforehand.
  setPluginConfigExplicitly: true,

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
  return {
    numerator: BigInt(whole + fraction),
    denominator: 10n ** BigInt(fraction.length),
  };
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

/// @dev sqrtPriceX96 for "token1 per token0" in raw units, i.e. human price scaled by the decimal difference.
function computeSqrtPriceX96(
  priceNumerator: bigint,
  priceDenominator: bigint,
  decimals0: bigint,
  decimals1: bigint,
): bigint {
  const numerator = priceNumerator * 10n ** decimals1 * 2n ** 192n;
  const denominator = priceDenominator * 10n ** decimals0;
  return sqrtBigInt(numerator / denominator);
}

// ============= MAIN =============

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

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

  const priced = config.pricedToken.toLowerCase();
  if (priced !== token0.toLowerCase() && priced !== token1.toLowerCase()) {
    throw new Error("pricedToken is neither of the pool's tokens");
  }

  const { numerator, denominator } = parseDecimal(config.priceInQuote);
  // The pool price is always token1 per token0, so invert when the priced token is token1.
  const pricedIsToken0 = priced === token0.toLowerCase();
  const sqrtPriceX96 = pricedIsToken0
    ? computeSqrtPriceX96(numerator, denominator, decimals0, decimals1)
    : computeSqrtPriceX96(denominator, numerator, decimals0, decimals1);

  if (sqrtPriceX96 === 0n) throw new Error("Computed sqrtPriceX96 is zero, check the price and decimals");

  console.log(
    `Price: 1 ${pricedIsToken0 ? symbol0 : symbol1} = ${config.priceInQuote} ${pricedIsToken0 ? symbol1 : symbol0}`,
  );
  console.log(`sqrtPriceX96: ${sqrtPriceX96}`);
  console.log("");

  // ============= 3. PLUGIN =============

  let pluginAddress = await pluginFactory.pluginByPool(poolAddress);

  if (pluginAddress === ZERO_ADDRESS) {
    console.log("=== Creating plugin ===");
    await waitTx(await pluginFactory.createPluginForExistingPool(token0, token1), "createPluginForExistingPool");
    pluginAddress = await pluginFactory.pluginByPool(poolAddress);
    console.log(`Plugin: ${pluginAddress}`);
  } else {
    console.log(`=== Plugin already created: ${pluginAddress} ===`);
  }
  console.log("");

  const plugin = await ethers.getContractAt("AlgebraUpgradeablePlugin", pluginAddress);

  // ============= 4. ATTACH PLUGIN TO POOL =============

  const currentPlugin = await pool.plugin();
  if (currentPlugin.toLowerCase() !== pluginAddress.toLowerCase()) {
    console.log("=== Attaching plugin to pool ===");
    // setPlugin resets the pool's plugin config to 0.
    await waitTx(await pool.setPlugin(pluginAddress), "setPlugin");
  } else {
    console.log("=== Plugin already attached ===");
  }

  const defaultPluginConfig = await plugin.defaultPluginConfig();
  const stateBefore = await pool.globalState();

  if (config.setPluginConfigExplicitly && stateBefore.pluginConfig !== defaultPluginConfig) {
    await waitTx(await pool.setPluginConfig(defaultPluginConfig), `setPluginConfig(${defaultPluginConfig})`);
  }
  console.log("");

  // ============= 5. INITIALIZE =============

  if (stateBefore.price === 0n) {
    console.log("=== Initializing pool ===");
    // beforeInitialize runs unconditionally and writes the plugin config, so the
    // AFTER_INIT hook that seeds the volatility oracle fires within this same call.
    await waitTx(await pool.initialize(sqrtPriceX96), `initialize(${sqrtPriceX96})`);
  } else {
    console.log(`=== Pool already initialized at sqrtPrice ${stateBefore.price} ===`);
  }
  console.log("");

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
  console.log("fee:         ", state.lastFee.toString());
  console.log("pluginConfig:", state.pluginConfig.toString(), `(expected ${defaultPluginConfig})`);
  console.log("tickSpacing: ", (await pool.tickSpacing()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
