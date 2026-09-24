import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Per-pool configuration that lives on the pool's plugin: which routers the permissioned
// module trusts, plus the limit order manager's tick spacing for this pool.
// Run it after setupPool.ts, i.e. once the pool has its plugin and is initialized.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const config = {
  pools: [
    "0xA436604c9fBEdcFf6e38223e03BCe22fa837B56b", // wMSTRx / USDG
    "0xAd510b8200aD149B41Db9CAB00Fee9B43a533b3C", // deJAAA / USDG
  ] as string[],

  // Routers the permissioned module trusts. They report the end user through IMsgSender, and
  // without this every swap or mint through them reverts RouterNotAllowed. The whitelist lives
  // on the plugin, so it is applied to each pool separately.
  allowedRouters: [
    "0xaAa81Db3cb943c20B032D16D9cbf471a3757931d", // PermissionedSwapRouter
    "0x893388ba29248261a0F13371BD4AE3700Ce06EC9", // PermissionedQuoterV2
    "0x6838becEdaFCd01e5f447B89aaf9d21FDe04c5d1", // PermissionedNFPM
    "0xe1909bcA4E528f7361b63F82330269d3001011e1"
  ] as string[],

  // Tick spacing of the pools themselves. 0 leaves them untouched.
  poolTickSpacing: 1,

  // Limit order manager: whitelisted as a router too, and gets its own per-pool tick spacing.
  // Leave empty to skip both.
  limitOrderManager: "0xe1909bcA4E528f7361b63F82330269d3001011e1",
  limitOrderTickSpacing: 1,

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

// ============= MAIN =============

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

  const routers = [...config.allowedRouters];
  if (config.limitOrderManager !== "") routers.push(config.limitOrderManager);

  // Minimal ABI on purpose: the manager's artifact belongs to the limit-order package.
  const manager =
    config.limitOrderManager === ""
      ? null
      : new ethers.Contract(
          ethers.getAddress(config.limitOrderManager),
          [
            "function setTickSpacing(address pool, int24 tickSpacing)",
            "function tickSpacings(address pool) view returns (int24)",
          ],
          deployer,
        );

  for (const poolEntry of config.pools) {
    const poolAddress = ethers.getAddress(poolEntry);
    const pool = await ethers.getContractAt("IAlgebraPool", poolAddress);
    const pluginAddress = await pool.plugin();

    console.log("========================================");
    console.log(`Pool:   ${poolAddress}`);

    if (pluginAddress === ZERO_ADDRESS) {
      console.log("No plugin attached, skipping. Run setupPool.ts first.");
      console.log("");
      continue;
    }

    const plugin = await ethers.getContractAt("AlgebraUpgradeablePlugin", pluginAddress);
    const modules = await plugin.getActiveModuleNames();
    console.log(`Plugin: ${pluginAddress}`);
    console.log(`Modules: ${modules.join(", ")}`);
    console.log("");

    // ============= 1. PERMISSIONED ROUTERS =============

    if (!modules.includes("Permissioned Pool Plugin")) {
      console.log("Plugin has no permissioned module, skipping the router whitelist");
    } else {
      for (const router of routers) {
        const address = ethers.getAddress(router);
        if (await plugin.allowedRouters(address)) {
          console.log(`${address} already allowed`);
          continue;
        }
        await waitTx(await plugin.setRouterAllowed(address, true), `setRouterAllowed(${address})`);
      }
    }

    // ============= 2. POOL TICK SPACING =============

    if (config.poolTickSpacing !== 0) {
      const currentPoolTickSpacing = await pool.tickSpacing();
      if (currentPoolTickSpacing !== BigInt(config.poolTickSpacing)) {
        await waitTx(await pool.setTickSpacing(config.poolTickSpacing), `setTickSpacing(${config.poolTickSpacing})`);
      } else {
        console.log(`Pool tick spacing already ${config.poolTickSpacing}`);
      }
    }

    // ============= 3. LIMIT ORDER TICK SPACING =============

    if (manager) {
      // setTickSpacing reads the pool's current tick, so the pool must already be initialized.
      const current = await manager.tickSpacings(poolAddress);
      if (current !== BigInt(config.limitOrderTickSpacing)) {
        await waitTx(
          await manager.setTickSpacing(poolAddress, config.limitOrderTickSpacing),
          `setTickSpacing(pool, ${config.limitOrderTickSpacing})`,
        );
      } else {
        console.log(`Limit order tick spacing already ${config.limitOrderTickSpacing}`);
      }
    }
    console.log("");
  }

  // ============= SUMMARY =============

  console.log("========================================");
  console.log("=== CONFIGURED ===");
  console.log("========================================");
  console.log("");

  for (const poolEntry of config.pools) {
    const poolAddress = ethers.getAddress(poolEntry);
    const pool = await ethers.getContractAt("IAlgebraPool", poolAddress);
    const pluginAddress = await pool.plugin();
    console.log(`${poolAddress} (plugin ${pluginAddress})`);

    if (pluginAddress !== ZERO_ADDRESS) {
      const plugin = await ethers.getContractAt("AlgebraUpgradeablePlugin", pluginAddress);
      const modules = await plugin.getActiveModuleNames();
      if (modules.includes("Permissioned Pool Plugin")) {
        for (const router of routers) {
          const address = ethers.getAddress(router);
          console.log(`  allowed ${address}: ${await plugin.allowedRouters(address)}`);
        }
      }
    }
    if (manager) console.log(`  limit order tick spacing: ${await manager.tickSpacings(poolAddress)}`);
    console.log(`  pool tick spacing:        ${await pool.tickSpacing()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
