import { ethers, network } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Fill these after deployVault.ts.
const VAULT = "0x1A6EB0846DEaBf20eF5e11F07205D17518Ead9B1";
const DEPOSIT_GUARD = "0xb9aA6adde7319c68D90879855D2bE28D3e235A2E";

// Zero means the deployer receives the vault shares.
const DEPOSIT_RECIPIENT = ZERO_ADDRESS;

// Amounts are parsed using vault token0/token1 decimals.
// For the current USDC/wstETH pool, token0 is USDC and token1 is wstETH.
const DEPOSIT_TOKEN0_AMOUNT = "1000";
const DEPOSIT_TOKEN1_AMOUNT = "0.5";
const MINIMUM_SHARES = 0n;

// Optional top-up transfer before the deposit. Leave recipient zero to skip.
const TRANSFER_RECIPIENT = "0x00009cc27c811a3e0FdD2Fd737afCc721B67eE8e";
const TRANSFER_TOKEN0_AMOUNT = "100";
const TRANSFER_TOKEN1_AMOUNT = "0.05";

const DEPLOY_CONFIRMATIONS = 1;
const TX_DELAY_MS = 2_000;

type TxLike = { wait: (confirmations?: number) => Promise<unknown> };

const vaultAbi = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
];

const depositGuardAbi = [
  "function deposit(uint256 amount0, uint256 amount1, uint256 minimumShares, address recipient) returns (uint256 shares)",
];

const erc20Abi = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address recipient, uint256 amount) returns (bool)",
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
  if (TX_DELAY_MS > 0) await sleep(TX_DELAY_MS);
}

async function approveIfNeeded(
  token: ethers.Contract,
  owner: string,
  spender: string,
  amount: bigint,
  symbol: string,
) {
  const allowance = await token.allowance(owner, spender);
  if (allowance >= amount) {
    console.log(`${symbol} allowance is enough`);
    return;
  }

  console.log(`Approving ${symbol} to deposit guard`);
  await waitForTx(await token.approve(spender, ethers.MaxUint256));
}

async function transferIfNeeded(
  token: ethers.Contract,
  recipient: string,
  amount: bigint,
  symbol: string,
) {
  if (recipient === ZERO_ADDRESS || amount === 0n) return;

  const decimals = Number(await token.decimals());
  console.log(
    `Transferring ${ethers.formatUnits(amount, decimals)} ${symbol} to ${recipient}`,
  );
  await waitForTx(await token.transfer(recipient, amount));
}

async function main() {
  requireAddress(VAULT, "VAULT");
  requireAddress(DEPOSIT_GUARD, "DEPOSIT_GUARD");

  const [deployer] = await ethers.getSigners();
  const recipient =
    DEPOSIT_RECIPIENT === ZERO_ADDRESS ? deployer.address : DEPOSIT_RECIPIENT;
  const vault = new ethers.Contract(VAULT, vaultAbi, deployer);
  const depositGuard = new ethers.Contract(
    DEPOSIT_GUARD,
    depositGuardAbi,
    deployer,
  );

  const token0Address = await vault.token0();
  const token1Address = await vault.token1();
  const token0 = new ethers.Contract(token0Address, erc20Abi, deployer);
  const token1 = new ethers.Contract(token1Address, erc20Abi, deployer);

  const token0Decimals = Number(await token0.decimals());
  const token1Decimals = Number(await token1.decimals());
  const token0Symbol = await token0.symbol();
  const token1Symbol = await token1.symbol();

  const depositAmount0 = ethers.parseUnits(
    DEPOSIT_TOKEN0_AMOUNT,
    token0Decimals,
  );
  const depositAmount1 = ethers.parseUnits(
    DEPOSIT_TOKEN1_AMOUNT,
    token1Decimals,
  );
  const transferAmount0 = ethers.parseUnits(
    TRANSFER_TOKEN0_AMOUNT,
    token0Decimals,
  );
  const transferAmount1 = ethers.parseUnits(
    TRANSFER_TOKEN1_AMOUNT,
    token1Decimals,
  );

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Vault: ${VAULT}`);
  console.log(`Deposit guard: ${DEPOSIT_GUARD}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Token0: ${token0Address} ${token0Symbol}`);
  console.log(`Token1: ${token1Address} ${token1Symbol}`);
  console.log("");

  await transferIfNeeded(
    token0,
    TRANSFER_RECIPIENT,
    transferAmount0,
    token0Symbol,
  );
  await transferIfNeeded(
    token1,
    TRANSFER_RECIPIENT,
    transferAmount1,
    token1Symbol,
  );

  await approveIfNeeded(
    token0,
    deployer.address,
    DEPOSIT_GUARD,
    depositAmount0,
    token0Symbol,
  );
  await approveIfNeeded(
    token1,
    deployer.address,
    DEPOSIT_GUARD,
    depositAmount1,
    token1Symbol,
  );

  console.log("");
  console.log(
    `Depositing ${DEPOSIT_TOKEN0_AMOUNT} ${token0Symbol} and ${DEPOSIT_TOKEN1_AMOUNT} ${token1Symbol}`,
  );
  await waitForTx(
    await depositGuard.deposit(
      depositAmount0,
      depositAmount1,
      MINIMUM_SHARES,
      recipient,
    ),
  );

  console.log("");
  console.log("=== Initial deposit summary ===");
  console.log(
    JSON.stringify(
      {
        network: network.name,
        vault: VAULT,
        depositGuard: DEPOSIT_GUARD,
        recipient,
        token0: {
          address: token0Address,
          symbol: token0Symbol,
          deposited: depositAmount0.toString(),
        },
        token1: {
          address: token1Address,
          symbol: token1Symbol,
          deposited: depositAmount1.toString(),
        },
        vaultShares: (await vault.balanceOf(recipient)).toString(),
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
