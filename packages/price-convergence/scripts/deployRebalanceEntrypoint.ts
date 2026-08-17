import { ethers, network } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Fill these before running the script.
const VAULT = "0x10EE336bcCd978aD306988b40b8814BCD79C8b64"; // PriceConvergenceVault address.
const ERC4626_VAULT = "0x4db3fBA9958F7eE9715875E485cEae299714029C"; // Same ERC4626 share token the vault was deployed with.

// The threshold token is auto-detected: whichever of the vault's token0/token1 has this symbol.
const THRESHOLD_TOKEN_SYMBOL = "USDC";
const THRESHOLD_AMOUNT_HUMAN = "1000"; // In THRESHOLD_TOKEN_SYMBOL's own decimals.

// Points the vault at the newly deployed entrypoint once it's ready. The caller must already
// hold PRICE_CONVERGENCE_VAULT_MANAGER (the deployer-bypass in setRebalanceEntrypoint only
// applies while the vault has no entrypoint set yet).
const SET_REBALANCE_ENTRYPOINT = true;

const DEPLOY_CONFIRMATIONS = 1;
const DEPLOY_TX_DELAY_MS = 2_000;

type TxLike = { wait: (confirmations?: number) => Promise<unknown> };

const vaultAbi = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function setRebalanceEntrypoint(address _rebalanceEntrypoint)",
];

const erc20Abi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

function requireAddress(value: string, name: string) {
  if (!ethers.isAddress(value) || value === ZERO_ADDRESS) {
    throw new Error(`${name} must be set before running the script`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTx(tx: TxLike) {
  await tx.wait(DEPLOY_CONFIRMATIONS);
  if (DEPLOY_TX_DELAY_MS > 0) await sleep(DEPLOY_TX_DELAY_MS);
}

async function main() {
  requireAddress(VAULT, "VAULT");
  requireAddress(ERC4626_VAULT, "ERC4626_VAULT");

  const [deployer] = await ethers.getSigners();
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);

  const token0Address = await vault.token0();
  const token1Address = await vault.token1();
  const token0 = new ethers.Contract(token0Address, erc20Abi, deployer);
  const token1 = new ethers.Contract(token1Address, erc20Abi, deployer);

  const [symbol0, symbol1] = await Promise.all([
    token0.symbol(),
    token1.symbol(),
  ]);

  let thresholdTokenAddress: string;
  let thresholdDecimals: number;
  if (symbol0 === THRESHOLD_TOKEN_SYMBOL) {
    thresholdTokenAddress = token0Address;
    thresholdDecimals = Number(await token0.decimals());
  } else if (symbol1 === THRESHOLD_TOKEN_SYMBOL) {
    thresholdTokenAddress = token1Address;
    thresholdDecimals = Number(await token1.decimals());
  } else {
    throw new Error(
      `Neither vault token matches THRESHOLD_TOKEN_SYMBOL "${THRESHOLD_TOKEN_SYMBOL}" ` +
        `(found "${symbol0}" and "${symbol1}")`,
    );
  }

  const rebalanceThreshold = ethers.parseUnits(
    THRESHOLD_AMOUNT_HUMAN,
    thresholdDecimals,
  );

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Vault: ${VAULT}`);
  console.log(`Token0: ${token0Address} (${symbol0})`);
  console.log(`Token1: ${token1Address} (${symbol1})`);
  console.log(
    `Threshold token: ${thresholdTokenAddress} (${THRESHOLD_TOKEN_SYMBOL}, ${thresholdDecimals} decimals)`,
  );
  console.log(
    `Rebalance threshold: ${THRESHOLD_AMOUNT_HUMAN} ${THRESHOLD_TOKEN_SYMBOL} ` +
      `(${rebalanceThreshold.toString()} raw units)`,
  );
  console.log("");

  console.log("=== Deploying RebalanceEntrypoint ===");
  const Entrypoint = await ethers.getContractFactory("RebalanceEntrypoint");
  const entrypoint = await Entrypoint.deploy(
    VAULT,
    ERC4626_VAULT,
    thresholdTokenAddress,
    rebalanceThreshold,
  );
  await entrypoint.waitForDeployment();
  const entrypointAddress = await entrypoint.getAddress();
  console.log(`RebalanceEntrypoint: ${entrypointAddress}`);

  if (SET_REBALANCE_ENTRYPOINT) {
    console.log("");
    console.log("=== Configuring vault ===");
    const tx = await vault.setRebalanceEntrypoint(entrypointAddress);
    await waitForTx(tx);
    console.log(`Vault rebalance entrypoint set: ${entrypointAddress}`);
  }

  console.log("");
  console.log("=== Deployment summary ===");
  console.log(
    JSON.stringify(
      {
        network: network.name,
        deployer: deployer.address,
        vault: VAULT,
        erc4626Vault: ERC4626_VAULT,
        thresholdToken: thresholdTokenAddress,
        thresholdTokenSymbol: THRESHOLD_TOKEN_SYMBOL,
        rebalanceThreshold: rebalanceThreshold.toString(),
        rebalanceEntrypoint: entrypointAddress,
        entrypointSetOnVault: SET_REBALANCE_ENTRYPOINT,
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
