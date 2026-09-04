import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { MODULE_IMPLEMENTATIONS, POOL_CONSTANTS, SQRT_RATIO } from './constants';

/**
 * Helper function to create and initialize a pool
 */
export async function createAndInitializePool(
  nft: any,
  signer: HardhatEthersSigner,
  token0: any,
  token1: any,
  algebraFactory: any
) {
  await nft.connect(signer).createAndInitializePoolIfNecessary(
    await token0.getAddress(),
    await token1.getAddress(),
    ethers.ZeroAddress,
    POOL_CONSTANTS.INITIAL_SQRT_PRICE,
    '0x'
  );

  const poolAddress = await algebraFactory.poolByPair(await token0.getAddress(), await token1.getAddress());
  const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
  const pluginAddress = await pool.plugin();
  const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);

  return { pool, poolAddress, plugin, pluginAddress };
}

/**
 * Helper function to add liquidity to a pool
 */
export async function addLiquidity(
  token0: any,
  token1: any,
  nft: any,
  deployer: HardhatEthersSigner,
  recipient: HardhatEthersSigner,
  amount: bigint
) {
  // Transfer tokens from deployer to recipient
  await token0.connect(deployer).transfer(recipient.address, amount);
  await token1.connect(deployer).transfer(recipient.address, amount);

  // Approve NFT to spend tokens
  const nftAddress = await nft.getAddress();
  await token0.connect(recipient).approve(nftAddress, amount);
  await token1.connect(recipient).approve(nftAddress, amount);

  // Calculate deadline
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // Mint position
  await nft.connect(recipient).mint({
    token0: await token0.getAddress(),
    token1: await token1.getAddress(),
    deployer: ethers.ZeroAddress,
    tickLower: POOL_CONSTANTS.TICK_LOWER,
    tickUpper: POOL_CONSTANTS.TICK_UPPER,
    amount0Desired: amount,
    amount1Desired: amount,
    amount0Min: 0,
    amount1Min: 0,
    recipient: recipient.address,
    deadline: deadline,
  });

  return deadline;
}

/**
 * Helper function to perform a swap
 */
export async function performSwap(
  swapRouter: any,
  deployer: HardhatEthersSigner,
  recipient: HardhatEthersSigner,
  token0: any,
  token1: any,
  amountIn: bigint,
  deadline: number,
  isReverse: boolean = false
) {
  const tokenIn = isReverse ? token1 : token0;
  const tokenOut = isReverse ? token0 : token1;
  const tokenContract = isReverse ? token1 : token0;

  // Transfer and approve
  await tokenContract.connect(deployer).transfer(recipient.address, amountIn);

  const swapRouterAddress = await swapRouter.getAddress();
  await tokenContract.connect(recipient).approve(swapRouterAddress, amountIn);

  // Execute swap
  await swapRouter.connect(recipient).exactInputSingle({
    tokenIn,
    tokenOut,
    deployer: ethers.ZeroAddress,
    recipient: recipient.address,
    deadline,
    amountIn,
    amountOutMinimum: 0,
    limitSqrtPrice: isReverse ? SQRT_RATIO.MAX - 1n : SQRT_RATIO.MIN + 1n,
  });
}

/**
 * Helper function to deploy a new plugin implementation
 */
export async function deployNewPluginImplementation(
  contractName: string,
  algebraFactory: any,
  pluginFactory: any,
  moduleOverrides?: {
    volatility?: string;
    dynamicFee?: string;
    farming?: string;
    alm?: string;
    security?: string;
    tradingHours?: string;
  }
) {
  const mockFactoryAddress = await algebraFactory.getAddress();
  const pluginFactoryAddress = await pluginFactory.getAddress();

  // Trading Hours has no deployed mainnet address yet (unlike the other 5 modules), so deploy a fresh
  // implementation for it unless the caller supplies one
  let tradingHoursAddress = moduleOverrides?.tradingHours;
  if (!tradingHoursAddress) {
    const TradingHoursImplFactory = await ethers.getContractFactory('TradingHoursPluginImplementation');
    tradingHoursAddress = await (await TradingHoursImplFactory.deploy()).getAddress();
  }

  const NewPluginFactory = await ethers.getContractFactory(contractName);
  const newPluginImpl = await NewPluginFactory.deploy(
    mockFactoryAddress,
    pluginFactoryAddress,
    moduleOverrides?.volatility ?? MODULE_IMPLEMENTATIONS.VOLATILITY_ORACLE,
    moduleOverrides?.dynamicFee ?? MODULE_IMPLEMENTATIONS.DYNAMIC_FEE,
    moduleOverrides?.farming ?? MODULE_IMPLEMENTATIONS.FARMING_PROXY,
    moduleOverrides?.alm ?? MODULE_IMPLEMENTATIONS.ALM,
    moduleOverrides?.security ?? MODULE_IMPLEMENTATIONS.SECURITY,
    tradingHoursAddress
  );

  return { newPluginImpl, address: await newPluginImpl.getAddress() };
}

/**
 * Complete helper: setup pool with liquidity and optionally perform initial swaps
 */
export async function setupPoolWithLiquidity(
  nft: any,
  ownerSigner: HardhatEthersSigner,
  token0: any,
  token1: any,
  algebraFactory: any,
  deployer: HardhatEthersSigner,
  swapRouter?: any,
  options?: {
    mintAmount?: bigint;
    performSwaps?: boolean;
    swapAmount?: bigint;
    swapCount?: number;
  }
) {
  const mintAmount = options?.mintAmount ?? ethers.parseEther('100000');
  const swapAmount = options?.swapAmount ?? ethers.parseEther('100');
  const swapCount = options?.swapCount ?? 1;

  // Create and initialize pool
  const { pool, poolAddress, plugin, pluginAddress } = await createAndInitializePool(
    nft,
    ownerSigner,
    token0,
    token1,
    algebraFactory
  );

  // Add liquidity
  const deadline = await addLiquidity(
    token0,
    token1,
    nft,
    deployer,
    ownerSigner,
    mintAmount
  );

  // Optionally perform initial swap(s)
  if (options?.performSwaps && swapRouter) {
    const swapSupply = swapAmount * BigInt(swapCount) * 2n;
    await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);

    for (let i = 0; i < swapCount; i++) {
      await performSwap(
        swapRouter,
        deployer,
        ownerSigner,
        token0,
        token1,
        swapAmount,
        deadline
      );
    }
  }

  return { pool, poolAddress, plugin, pluginAddress, deadline };
}
