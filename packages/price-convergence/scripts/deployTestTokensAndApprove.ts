import { ethers, network } from "hardhat";

const ETH_AMOUNT = ethers.parseUnits("1000000", 18);
const WSTETH_DEPOSIT_AMOUNT = ethers.parseUnits("1000000", 18);
const USDC_AMOUNT = ethers.parseUnits("1000000000", 6);
const WSTETH_DECIMALS_OFFSET = 0;

const DEPLOY_CONFIRMATIONS = 1;
const DEPLOY_TX_DELAY_MS = 2_000;

type TxLike = { wait: (confirmations?: number) => Promise<unknown> };
type Deployable = {
  waitForDeployment: () => Promise<unknown>;
  deploymentTransaction?: () => TxLike | null;
};

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

async function deployToken(
  name: string,
  symbol: string,
  decimals: number,
  mintAmount: bigint,
) {
  const [deployer] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy(name, symbol, decimals);
  await waitForDeployment(token);

  const address = await token.getAddress();
  await waitForTx(await token.mint(deployer.address, mintAmount));

  console.log(`${symbol}: ${address}`);
  console.log(
    `${symbol} minted: ${ethers.formatUnits(mintAmount, decimals)} to ${deployer.address}`,
  );

  return token;
}

async function deployERC4626Vault(
  asset: string,
  offset: number,
  depositAmount: bigint,
) {
  const [deployer] = await ethers.getSigners();
  const ERC4626 = await ethers.getContractFactory("MockERC4626");
  const erc4626Vault = await ERC4626.deploy(asset, offset);
  await waitForDeployment(erc4626Vault);

  const address = await erc4626Vault.getAddress();
  const assetToken = await ethers.getContractAt("MockERC20", asset);
  await waitForTx(await assetToken.approve(address, depositAmount));
  await waitForTx(await erc4626Vault.deposit(depositAmount, deployer.address));

  console.log(`wstETH ERC4626 vault: ${address}`);
  console.log(
    `wstETH shares minted: ${ethers.formatUnits(depositAmount, 18)} to ${deployer.address}`,
  );

  return erc4626Vault;
}

async function main() {
  if (WSTETH_DEPOSIT_AMOUNT > ETH_AMOUNT) {
    throw new Error(
      "WSTETH_DEPOSIT_AMOUNT must be less than or equal to ETH_AMOUNT",
    );
  }

  const [deployer] = await ethers.getSigners();

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

  const eth = await deployToken("Ether", "ETH", 18, ETH_AMOUNT);
  console.log("");
  const wsteth = await deployERC4626Vault(
    await eth.getAddress(),
    WSTETH_DECIMALS_OFFSET,
    WSTETH_DEPOSIT_AMOUNT,
  );
  console.log("");
  const usdc = await deployToken("USD Coin", "USDC", 6, USDC_AMOUNT);

  console.log("");
  console.log("=== Test token deployment summary ===");
  console.log(
    JSON.stringify(
      {
        network: network.name,
        deployer: deployer.address,
        tokens: {
          ETH: {
            address: await eth.getAddress(),
            decimals: 18,
            minted: ETH_AMOUNT.toString(),
          },
          wstETH: {
            address: await wsteth.getAddress(),
            asset: await eth.getAddress(),
            decimalsOffset: WSTETH_DECIMALS_OFFSET,
            erc4626Vault: true,
            depositedAssets: WSTETH_DEPOSIT_AMOUNT.toString(),
          },
          USDC: {
            address: await usdc.getAddress(),
            decimals: 6,
            minted: USDC_AMOUNT.toString(),
          },
        },
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
