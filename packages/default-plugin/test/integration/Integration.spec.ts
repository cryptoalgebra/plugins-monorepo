import { config, ethers } from 'hardhat';
import { expect } from 'test-utils/expect';
import { loadFixture, impersonateAccount, setBalance } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { ADDRESSES,  SQRT_RATIO } from './constants';
import {
  createAndInitializePool,
  addLiquidity,
  performSwap,
  deployNewPluginImplementation,
  setupPoolWithLiquidity
} from './helpers';

// Needs a live Base fork, which the coverage network does not provide
describe('Integration Tests - Fork [ @skip-on-coverage ]', function() {
  // AlgebraPool.gas.spec.ts calls reset() with no arguments, which drops the fork for every spec
  // after it. Re-establish it here so this suite does not depend on file order.
  before('restore the Base fork', async () => {
    const forking = config.networks.hardhat.forking;
    if (forking === undefined) throw new Error('hardhat network is configured without forking');

    await helpers.reset(forking.url, forking.blockNumber);
  });

  async function deployFixture() {
    await helpers.mine();
    
    const algebraFactory = await ethers.getContractAt('IAlgebraFactory', ADDRESSES.ALGEBRA_FACTORY);
    const nft = await ethers.getContractAt('INonfungiblePositionManager', ADDRESSES.NFT_POSITION_MANAGER);
    const swapRouter = await ethers.getContractAt('ISwapRouter', ADDRESSES.SWAP_ROUTER);
    const newPluginFactory = await ethers.getContractAt('AlgebraUpgradeablePluginFactory', ADDRESSES.PLUGIN_FACTORY);
    
    const owner = await algebraFactory.owner();
    await impersonateAccount(owner);
    await setBalance(owner, ethers.parseEther('10'));
    const ownerSigner = await ethers.getSigner(owner);
    
    // Get the deployer signer (first signer) who will deploy and own the test tokens
    const [deployer] = await ethers.getSigners();
    
    // Deploy test tokens
    const tokenFactory = await ethers.getContractFactory('TestERC20');
    const tokenAContract = await tokenFactory.connect(deployer).deploy(ethers.parseEther('10000000000000000000'));
    const tokenBContract = await tokenFactory.connect(deployer).deploy(ethers.parseEther('10000000000000000000'));

    // Sort tokens (token0 < token1)
    const [token0, token1] = (await tokenAContract.getAddress()).toLowerCase() < (await tokenBContract.getAddress()).toLowerCase()
      ? [tokenAContract, tokenBContract]
      : [tokenBContract, tokenAContract];
    
    // Get beacon
    const beaconAddress = await newPluginFactory.beacon();
    const beacon = await ethers.getContractAt('UpgradeableBeacon', beaconAddress);
    
    // Set default plugin factory
    await algebraFactory.connect(ownerSigner).setDefaultPluginFactory(await newPluginFactory.getAddress());
    
    return { 
      owner, 
      ownerSigner, 
      algebraFactory,
      token0, 
      token1, 
      nft,
      swapRouter,
      newPluginFactory,
      beacon,
      deployer
    };
  }

  it('wires the upgradeable plugin factory in as the default one', async () => {
    const { algebraFactory, newPluginFactory, beacon } = await loadFixture(deployFixture);

    expect(await algebraFactory.defaultPluginFactory()).to.equal(await newPluginFactory.getAddress());
    expect(await newPluginFactory.beacon()).to.equal(await beacon.getAddress());
    expect(await beacon.implementation()).to.not.equal(ethers.ZeroAddress);
  });

  it('creates pool and adds liquidity', async () => {
    const { ownerSigner, algebraFactory, token0, token1, nft, deployer } = await loadFixture(deployFixture);
    
    const mintAmount = ethers.parseEther('100000');
    
    // Create pool and initialize
    const { pool } = await createAndInitializePool(nft, ownerSigner, token0, token1, algebraFactory);
    
    // Add liquidity
    await addLiquidity(token0, token1, nft, deployer, ownerSigner, mintAmount);
    
    // Verify reserves
    const reserves = await pool.getReserves();
    expect(reserves[0]).to.be.gt(0);
    expect(reserves[1]).to.be.gt(0);
  });

  it('performs swap on pool with upgradeable plugin', async () => {
    const { ownerSigner, algebraFactory, token0, token1, nft, swapRouter, deployer } = await loadFixture(deployFixture);
    
    const mintAmount = ethers.parseEther('1000000000');
    const swapAmount = ethers.parseEther('1000000');
    
    // Create pool
    const { pool } = await createAndInitializePool(nft, ownerSigner, token0, token1, algebraFactory);
    
    // Add liquidity
    const deadline = await addLiquidity(token0, token1, nft, deployer, ownerSigner, mintAmount);
    
    const liquidity = await pool.liquidity();
    expect(liquidity).to.be.gt(0);
    
    // Perform swap
    const token0BalanceBefore = await token0.balanceOf(ownerSigner.address);
    const token1BalanceBefore = await token1.balanceOf(ownerSigner.address);

    await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
    
    const token0BalanceAfter = await token0.balanceOf(ownerSigner.address);
    const token1BalanceAfter = await token1.balanceOf(ownerSigner.address);

    // Verify swap happened
    expect(token1BalanceAfter).to.be.gt(token1BalanceBefore);
  });

  describe('#Plugin Upgrade on Live Network', () => {
    let ownerSigner;
    let algebraFactory;
    let token0, token1;
    let nft;
    let swapRouter;
    let newPluginFactory;
    let beacon, implementationBefore;
    let pool, poolAddress, pluginAddress, plugin;
    let deployer;
    let mintAmount, swapAmount, swapSupply, deadline;
    let newImplAddress;
    let swapRouterAddress;
    let feeConfigBefore, poolBefore, factoryBefore;
    let swapOutput1, token1Before1;
  
    
      
    beforeEach(async function(){
      ({ ownerSigner, algebraFactory, token0, token1, nft, swapRouter, newPluginFactory, beacon, deployer } = await loadFixture(deployFixture));
          
      // Create pool and get plugin
      const poolData = await createAndInitializePool(nft, ownerSigner, token0, token1, algebraFactory);
      pool = poolData.pool;
      poolAddress = poolData.poolAddress;
      plugin = poolData.plugin;
      pluginAddress = poolData.pluginAddress;
      
      // Add liquidity
      mintAmount = ethers.parseEther('100000000');
      deadline = await addLiquidity(token0, token1, nft, deployer, ownerSigner, mintAmount);
      
      // Prepare swap funds
      swapSupply = ethers.parseEther('10000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      await token1.connect(deployer).transfer(ownerSigner.address, swapSupply);
    
      // Perform initial swap
      swapAmount = ethers.parseEther('1000');
      swapRouterAddress = await swapRouter.getAddress();
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 3n);
      
      token1Before1 = await token1.balanceOf(ownerSigner.address);
      await performSwap( swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const token1After1 = await token1.balanceOf(ownerSigner.address);
      swapOutput1 = token1After1 - token1Before1;
      expect(swapOutput1).to.be.gt(0);
      
      // Store plugin state before upgrade
      feeConfigBefore = await plugin.feeConfig.staticCall();
      poolBefore = await plugin.pool();
      factoryBefore = await plugin.pluginFactory();
      implementationBefore = await beacon.implementation();
      
      // Deploy new implementation
      const result = await deployNewPluginImplementation(
        'AlgebraUpgradeablePlugin',
        algebraFactory,
        newPluginFactory
      );
      
      newImplAddress = result.address;
    });

    it('upgradePlugins is refused without the administrator role and accepted with it', async() =>{
      await expect(newPluginFactory.upgradePlugins(newImplAddress)).to.be.revertedWithCustomError(
        newPluginFactory,
        'OnlyAdministrator'
      );

      // Same call from the Algebra factory owner goes through
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newImplAddress);
      expect(await beacon.implementation()).to.equal(newImplAddress);
    });

    it('reverts when upgrading to zero address', async () => {
      const { ownerSigner, newPluginFactory } = await loadFixture(deployFixture);

      await expect(
        newPluginFactory.connect(ownerSigner).upgradePlugins(ethers.ZeroAddress)
      ).to.be.revertedWith('UpgradeableBeacon: implementation is not a contract');
    });

    it('reverts when upgrading to non-contract address', async () => {
      const { ownerSigner, newPluginFactory } = await loadFixture(deployFixture);
      const [randomAddress] = await ethers.getSigners();

      await expect(
        newPluginFactory.connect(ownerSigner).upgradePlugins(randomAddress.address)
      ).to.be.revertedWith('UpgradeableBeacon: implementation is not a contract');
    });
    it('upgrades plugin implementation via beacon and swaps still work', async () => {
      // Upgrade plugin
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newImplAddress);
      
      const implementationAfter = await beacon.implementation();
      
      // Verify plugin state preserved
      const pluginAfterUpgrade = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
      const feeConfigAfter = await pluginAfterUpgrade.feeConfig.staticCall();
      const poolAfter = await pluginAfterUpgrade.pool();
      const factoryAfter = await pluginAfterUpgrade.pluginFactory();
      
      expect(poolAfter).to.equal(poolBefore);
      expect(factoryAfter).to.equal(factoryBefore);
      expect(feeConfigAfter.baseFee).to.equal(feeConfigBefore.baseFee);
      
      // Perform swap after upgrade
      const token1Before2 = await token1.balanceOf(ownerSigner.address);
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const token1After2 = await token1.balanceOf(ownerSigner.address);
      const swapOutput2 = token1After2 - token1Before2;
      
      // Verify swap worked
      expect(swapOutput2).to.be.gt(0);
      
      // Verify swap output is reasonable (within 50-200% of previous swap)
      const outputRatio = Number(swapOutput2) / Number(swapOutput1);
      expect(outputRatio).to.be.gt(0.5).and.lt(2);
    });

    it('multiple swaps work correctly after plugin upgrade', async () => {
      // Upgrade plugin
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newImplAddress);
      
      // Additional funds for swaps
      const swapSupply = ethers.parseEther('10000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      await token1.connect(deployer).transfer(ownerSigner.address, swapSupply);
      
      // Perform multiple bidirectional swaps
      const swapAmount = ethers.parseEther('500');
      const swapRouterAddress = await swapRouter.getAddress();
      
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 10n);
      await token1.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 10n);
      
      for (let i = 0; i < 3; i++) {
        const balance0Before = await token0.balanceOf(ownerSigner.address);
        const balance1Before = await token1.balanceOf(ownerSigner.address);
        
        // Swap token0 -> token1
        await swapRouter.connect(ownerSigner).exactInputSingle({
          tokenIn: token0,
          tokenOut: token1,
          deployer: ethers.ZeroAddress,
          recipient: ownerSigner.address,
          deadline: deadline,
          amountIn: swapAmount,
          amountOutMinimum: 0,
          limitSqrtPrice: SQRT_RATIO.MIN + 1n
        });
        
        const balance1After = await token1.balanceOf(ownerSigner.address);
        expect(balance1After).to.be.gt(balance1Before);
        
        // Swap token1 -> token0 (reverse)
        await swapRouter.connect(ownerSigner).exactInputSingle({
          tokenIn: token1,
          tokenOut: token0,
          deployer: ethers.ZeroAddress,
          recipient: ownerSigner.address,
          deadline: deadline,
          amountIn: swapAmount / 2n,
          amountOutMinimum: 0,
          limitSqrtPrice: SQRT_RATIO.MAX - 1n
        });
        
        const balance0After = await token0.balanceOf(ownerSigner.address);
        expect(balance0After).not.to.equal(balance0Before);
      }
    });
  });
  describe('#Upgrade plugin with upgraded module', ()=> {
    let ownerSigner, algebraFactory, token0, token1;
    let nft, swapRouter, newPluginFactory, beacon;
    let pool, poolAddress, plugin, pluginAddress, deployer, deadline;

    beforeEach(async () => {
      ({ ownerSigner, algebraFactory, token0, token1, nft, swapRouter, newPluginFactory, beacon, deployer } = await loadFixture(deployFixture));
      
      // Setup pool with liquidity and one initial swap
      const poolData = await setupPoolWithLiquidity(
        nft, ownerSigner,
        token0, token1, algebraFactory, deployer, swapRouter,
        { mintAmount: ethers.parseEther('100000'), performSwaps: true, swapAmount: ethers.parseEther('100') }
      );
      
      pool = poolData.pool;
      poolAddress = poolData.poolAddress;
      plugin = poolData.plugin;
      pluginAddress = poolData.pluginAddress;
      deadline = poolData.deadline;
    });

    it('upgrades security module and new functions work while plugin stays attached to pool', async () => {
      expect(await pool.plugin()).to.equal(pluginAddress);
      
      
      
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      const upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();
      const upgradedSecurityAddress = await upgradedSecurityImpl.getAddress();
      
      
      // Deploy new plugin with upgraded security
      const result = await deployNewPluginImplementation(
        'MockUpgradedPluginWithNewSecurity',
        algebraFactory,
        newPluginFactory,
        { security: upgradedSecurityAddress }
      );
      
      const newPluginAddress = result.address;
      
      
      // Upgrade to new implementation
      await newPluginFactory.connect(ownerSigner).upgradePlugins(result.address);
      
      const implementationAfter = await beacon.implementation();
      expect(implementationAfter).to.equal(result.address);
      
      // Verify plugin still attached to pool
      const poolPluginAfter = await pool.plugin();
      expect(poolPluginAfter).to.equal(pluginAddress);
      
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', pluginAddress);
      
      // Verify new security functions available
      expect(await upgradedPlugin.HAS_UPGRADED_SECURITY()).to.equal(true);
      expect(await upgradedPlugin.hasUpgradedSecurityImpl.staticCall()).to.equal(true);
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(false);
      
      await upgradedPlugin.connect(ownerSigner).setSecurityEmergencyMode(true);
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(true);
      
      await upgradedPlugin.connect(ownerSigner).setSecurityEmergencyMode(false);
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(false);
      
      const statsResult = await upgradedPlugin.getSecurityCheckStats.staticCall();
      
      // Perform swap after upgrade
      const swapAmount = ethers.parseEther('100');
      const token1Before = await token1.balanceOf(ownerSigner.address);
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      const statsAfterSwap = await upgradedPlugin.getSecurityCheckStats.staticCall();
      expect(statsAfterSwap.checkCount).to.be.gt(statsResult.checkCount);
    });
  });

  describe('#Storage Collision test', () => {
    let ownerSigner, algebraFactory, token0, token1;
    let nft, swapRouter, newPluginFactory, beacon;
    let pool, poolAddress, plugin, pluginAddress, deployer, deadline;
    let securityRegistry, securityRegistryAddress;

    beforeEach(async () => {
      ({ ownerSigner, algebraFactory, token0, token1, nft, swapRouter, newPluginFactory, beacon, deployer } = await loadFixture(deployFixture));
      
      // Deploy and set security registry
      const SecurityRegistryFactory = await ethers.getContractFactory('MockSecurityRegistry');
      securityRegistry = await SecurityRegistryFactory.deploy();
      securityRegistryAddress = await securityRegistry.getAddress();
      await newPluginFactory.connect(ownerSigner).setSecurityRegistry(securityRegistryAddress);
      
      // Setup pool with liquidity and multiple swaps
      const poolData = await setupPoolWithLiquidity(
        nft, ownerSigner,
        token0, token1, algebraFactory, deployer, swapRouter,
        { performSwaps: true, swapAmount: ethers.parseEther('100'), swapCount: 3 }
      );
      
      pool = poolData.pool;
      poolAddress = poolData.poolAddress;
      plugin = poolData.plugin;
      pluginAddress = poolData.pluginAddress;
      deadline = poolData.deadline;
    });

    it('verifies no storage collision after security module upgrade', async () => {
      // Verify security registry set before upgrade
      const securityRegistryBefore = await plugin.getSecurityRegistry();
      expect(securityRegistryBefore).to.equal(securityRegistryAddress);
      expect(securityRegistryBefore).to.not.equal(ethers.ZeroAddress);
      
      const rebalanceManagerBefore = await plugin.rebalanceManager();
      const incentiveBefore = await plugin.incentive();
      const feeConfigBefore = await plugin.feeConfig();
      const isInitializedBefore = await plugin.isInitialized();
      const timepointIndexBefore = await plugin.timepointIndex();
      const lastTimestampBefore = await plugin.lastTimepointTimestamp();
      // Raw stored timepoint, unlike getSingleTimepoint(0) it does not extrapolate to block.timestamp
      const timepoint0Before = await plugin.timepoints(0);
      
      // Deploy upgraded security implementation
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      const upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();
      const upgradedSecurityAddress = await upgradedSecurityImpl.getAddress();
      
      // Deploy new plugin with upgraded security
      const result = await deployNewPluginImplementation(
        'MockUpgradedPluginWithNewSecurity',
        algebraFactory,
        newPluginFactory,
        { security: upgradedSecurityAddress }
      );
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(result.address);
      
      
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', pluginAddress);
      
      const securityRegistryAfter = await upgradedPlugin.getSecurityRegistry();
      expect(securityRegistryAfter).to.equal(securityRegistryBefore);
      expect(securityRegistryAfter).to.equal(securityRegistryAddress);
      expect(securityRegistryAfter).to.not.equal(ethers.ZeroAddress);
      
      expect(await upgradedPlugin.rebalanceManager()).to.equal(rebalanceManagerBefore);
      
      expect(await upgradedPlugin.incentive()).to.equal(incentiveBefore);
      
      const feeConfigAfter = await upgradedPlugin.feeConfig();
      expect(feeConfigAfter.baseFee).to.equal(feeConfigBefore.baseFee);
      
      const isInitializedAfter = await upgradedPlugin.isInitialized();
      const timepointIndexAfter = await upgradedPlugin.timepointIndex();
      expect(isInitializedAfter).to.equal(isInitializedBefore);
      expect(timepointIndexAfter).to.equal(timepointIndexBefore);
      expect(await upgradedPlugin.lastTimepointTimestamp()).to.equal(lastTimestampBefore);

      const volatilityAfter = await upgradedPlugin.getSingleTimepoint(0);
      expect(volatilityAfter.tickCumulative).to.not.equal(0n);

      // Every word of the stored timepoint has to match, a collision would shift them individually
      const timepoint0After = await upgradedPlugin.timepoints(0);
      expect(timepoint0After.initialized).to.equal(timepoint0Before.initialized);
      expect(timepoint0After.blockTimestamp).to.equal(timepoint0Before.blockTimestamp);
      expect(timepoint0After.tickCumulative).to.equal(timepoint0Before.tickCumulative);
      expect(timepoint0After.volatilityCumulative).to.equal(timepoint0Before.volatilityCumulative);
      expect(timepoint0After.tick).to.equal(timepoint0Before.tick);
      expect(timepoint0After.averageTick).to.equal(timepoint0Before.averageTick);

      
      expect(await upgradedPlugin.HAS_UPGRADED_SECURITY()).to.equal(true);
      expect(await upgradedPlugin.hasUpgradedSecurityImpl.staticCall()).to.equal(true);
      
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(false);
      await upgradedPlugin.connect(ownerSigner).setSecurityEmergencyMode(true);
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(true);
      
      const statsBefore = await upgradedPlugin.getSecurityCheckStats.staticCall();
      
      
      
      expect(await upgradedPlugin.getSecurityRegistry()).to.equal(securityRegistryAddress);
      
      expect(await upgradedPlugin.rebalanceManager()).to.equal(rebalanceManagerBefore);
      
      const volatilityFinal = await upgradedPlugin.getSingleTimepoint(0);
      expect(volatilityFinal.tickCumulative).to.not.equal(0n);
      
      
      await upgradedPlugin.connect(ownerSigner).setSecurityEmergencyMode(false);
      
      const swapAmount = ethers.parseEther('100');
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const statsAfterSwap = await upgradedPlugin.getSecurityCheckStats.staticCall();
      expect(statsAfterSwap.checkCount).to.be.gt(statsBefore.checkCount);
      expect(statsAfterSwap.lastCheckTimestamp).to.be.gt(0);

      const newTimepointIndex = await upgradedPlugin.timepointIndex();
      expect(newTimepointIndex).to.be.gt(timepointIndexBefore);
      
      expect(await upgradedPlugin.getSecurityRegistry()).to.equal(securityRegistryAddress);
    
    });
  });
  
  it('upgrades FarmingProxy module and new functions work while plugin stays attached', async () => {
      const { algebraFactory, ownerSigner, newPluginFactory, beacon, token0, token1, nft, deployer, swapRouter } = await loadFixture(deployFixture);
      
      // Create pool and add liquidity
      const mintAmount = ethers.parseEther('100000');
      const { pool, poolAddress, plugin, pluginAddress, deadline } = await setupPoolWithLiquidity(
        nft, ownerSigner, token0, token1, algebraFactory, deployer,
        swapRouter, { mintAmount }
      );
      
      // Deploy upgraded farming implementation
      const UpgradedFarmingImplFactory = await ethers.getContractFactory('MockUpgradedFarmingProxyPluginImplementation');
      const upgradedFarmingImpl = await UpgradedFarmingImplFactory.deploy();
      const upgradedFarmingAddress = await upgradedFarmingImpl.getAddress();
      
      // Deploy new plugin with upgraded farming
      const result = await deployNewPluginImplementation(
        'MockUpgradedPluginWithNewFarming',
        algebraFactory,
        newPluginFactory,
        { farming: upgradedFarmingAddress }
      );
      
      // Upgrade to new implementation
      await newPluginFactory.connect(ownerSigner).upgradePlugins(result.address);
      
      const implementationAfter = await beacon.implementation();
      expect(implementationAfter).to.equal(result.address);
      
      
      // Verify plugin still attached
      const poolPluginAfter = await pool.plugin();
      expect(poolPluginAfter).to.equal(pluginAddress);
      
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPluginWithNewFarming', pluginAddress);
      
      // Verify new farming functions
      expect(await upgradedPlugin.HAS_UPGRADED_FARMING()).to.equal(true);
      expect(await upgradedPlugin.hasUpgradedFarmingImpl.staticCall()).to.equal(true);
      expect(await upgradedPlugin.getFarmingPausedMode.staticCall()).to.equal(false);
      
      await upgradedPlugin.connect(ownerSigner).setFarmingPausedMode(true);
      expect(await upgradedPlugin.getFarmingPausedMode.staticCall()).to.equal(true);
      
      await upgradedPlugin.connect(ownerSigner).setFarmingPausedMode(false);
      expect(await upgradedPlugin.getFarmingPausedMode.staticCall()).to.equal(false);
      
      
      // Perform swap after upgrade
      const swapAmount = ethers.parseEther('100');
      const token1Before = await token1.balanceOf(ownerSigner.address);
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      
    });

  describe('#Super Upgrade - ALL Modules V2', () => {
    let ownerSigner, algebraFactory, token0, token1;
    let nft, swapRouter, newPluginFactory, beacon;
    let pool, poolAddress, plugin, pluginAddress, deployer, deadline;

    beforeEach(async () => {
      const fixture = await loadFixture(deployFixture);
      ownerSigner = fixture.ownerSigner;
      algebraFactory = fixture.algebraFactory;

      token0 = fixture.token0;
      token1 = fixture.token1;
      nft = fixture.nft;
      swapRouter = fixture.swapRouter;
      newPluginFactory = fixture.newPluginFactory;
      beacon = fixture.beacon;
      deployer = fixture.deployer;
      
      // Setup pool with liquidity and one initial swap
      const poolData = await setupPoolWithLiquidity(
        nft, ownerSigner,
        token0, token1, algebraFactory, deployer, swapRouter,
        { performSwaps: true, swapAmount: ethers.parseEther('100') }
      );
      
      pool = poolData.pool;
      poolAddress = poolData.poolAddress;
      plugin = poolData.plugin;
      pluginAddress = poolData.pluginAddress;
      deadline = poolData.deadline;
    });

    it('upgrades ALL 5 modules simultaneously and all work together', async () => {
      // Deploy all 5 upgraded module implementations
      const UpgradedVolatilityFactory = await ethers.getContractFactory('MockUpgradedVolatilityOraclePluginImplementation');
      const upgradedVolatility = await UpgradedVolatilityFactory.deploy();
      
      const UpgradedDynamicFeeFactory = await ethers.getContractFactory('MockUpgradedDynamicFeePluginImplementation');
      const upgradedDynamicFee = await UpgradedDynamicFeeFactory.deploy();
      
      const UpgradedFarmingFactory = await ethers.getContractFactory('MockUpgradedFarmingProxyPluginImplementation');
      const upgradedFarming = await UpgradedFarmingFactory.deploy();
      
      const UpgradedAlmFactory = await ethers.getContractFactory('MockUpgradedALMPluginImplementation');
      const upgradedAlm = await UpgradedAlmFactory.deploy();
      
      const UpgradedSecurityFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      const upgradedSecurity = await UpgradedSecurityFactory.deploy();
      
      // Deploy super plugin with all upgraded modules
      const mockFactoryAddress = await algebraFactory.getAddress();
      const pluginFactoryAddress = await newPluginFactory.getAddress();
      
      const SuperPluginFactory = await ethers.getContractFactory('MockSuperUpgradedPlugin');
      const superPlugin = await SuperPluginFactory.deploy(mockFactoryAddress, pluginFactoryAddress, {
        volatilityOracle: await upgradedVolatility.getAddress(),
        dynamicFee: await upgradedDynamicFee.getAddress(),
        farmingProxy: await upgradedFarming.getAddress(),
        alm: await upgradedAlm.getAddress(),
        security: await upgradedSecurity.getAddress()
      });
      
      const superPluginAddress = await superPlugin.getAddress();
      
      // Upgrade to super plugin
      await newPluginFactory.connect(ownerSigner).upgradePlugins(superPluginAddress);
      
      const implementationAfter = await beacon.implementation();
      expect(implementationAfter).to.equal(superPluginAddress);
      
      const upgradedPluginProxy = await ethers.getContractAt('MockSuperUpgradedPlugin', pluginAddress);
      
      
      expect(await upgradedPluginProxy.HAS_UPGRADED_VOLATILITY()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_DYNAMIC_FEE()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_FARMING()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_ALM()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_SECURITY()).to.equal(true);
      
      
      expect(await upgradedPluginProxy.hasUpgradedVolatilityImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedDynamicFeeImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedFarmingImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedAlmImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedSecurityImpl.staticCall()).to.equal(true);
      
      
      await upgradedPluginProxy.connect(ownerSigner).setAdvancedFeeMode(true);
      expect(await upgradedPluginProxy.getAdvancedFeeMode.staticCall()).to.equal(true);
      
      
      await upgradedPluginProxy.connect(ownerSigner).setFarmingPausedMode(true);
      expect(await upgradedPluginProxy.getFarmingPausedMode.staticCall()).to.equal(true);
      await upgradedPluginProxy.connect(ownerSigner).setFarmingPausedMode(false);
      
      
      await upgradedPluginProxy.connect(ownerSigner).setAlmAdvancedMode(true);
      expect(await upgradedPluginProxy.getAlmAdvancedMode.staticCall()).to.equal(true);
      
      
      await upgradedPluginProxy.connect(ownerSigner).setSecurityEmergencyMode(true);
      expect(await upgradedPluginProxy.getSecurityEmergencyMode.staticCall()).to.equal(true);
      await upgradedPluginProxy.connect(ownerSigner).setSecurityEmergencyMode(false);
      
      // Perform swap to verify all modules work together
      const swapAmount = ethers.parseEther('100');
      const token1Before = await token1.balanceOf(ownerSigner.address);
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      // Verify stats from upgraded modules
      const securityStats = await upgradedPluginProxy.getSecurityCheckStats.staticCall();
      
      expect(securityStats.checkCount).to.be.gt(0);
      
    });
    it('Downgrades from super plugin to plugin with oracle module', async () => {
      // Deploy all 5 upgraded module implementations
      const UpgradedVolatilityFactory = await ethers.getContractFactory('MockUpgradedVolatilityOraclePluginImplementation');
      const upgradedVolatility = await UpgradedVolatilityFactory.deploy();
      
      const UpgradedDynamicFeeFactory = await ethers.getContractFactory('MockUpgradedDynamicFeePluginImplementation');
      const upgradedDynamicFee = await UpgradedDynamicFeeFactory.deploy();
      
      const UpgradedFarmingFactory = await ethers.getContractFactory('MockUpgradedFarmingProxyPluginImplementation');
      const upgradedFarming = await UpgradedFarmingFactory.deploy();
      
      const UpgradedAlmFactory = await ethers.getContractFactory('MockUpgradedALMPluginImplementation');
      const upgradedAlm = await UpgradedAlmFactory.deploy();
      
      const UpgradedSecurityFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      const upgradedSecurity = await UpgradedSecurityFactory.deploy();
      
      // Deploy super plugin with all upgraded modules
      const mockFactoryAddress = await algebraFactory.getAddress();
      const pluginFactoryAddress = await newPluginFactory.getAddress();
      
      const SuperPluginFactory = await ethers.getContractFactory('MockSuperUpgradedPlugin');
      const superPlugin = await SuperPluginFactory.deploy(mockFactoryAddress, pluginFactoryAddress, {
        volatilityOracle: await upgradedVolatility.getAddress(),
        dynamicFee: await upgradedDynamicFee.getAddress(),
        farmingProxy: await upgradedFarming.getAddress(),
        alm: await upgradedAlm.getAddress(),
        security: await upgradedSecurity.getAddress()
      });
      
      const superPluginAddress = await superPlugin.getAddress();
      
      // Upgrade to super plugin
      await newPluginFactory.connect(ownerSigner).upgradePlugins(superPluginAddress);
      
      const implementationAfterUpgrade = await beacon.implementation();
      expect(implementationAfterUpgrade).to.equal(superPluginAddress);
      
      const upgradedPluginProxy = await ethers.getContractAt('MockSuperUpgradedPlugin', pluginAddress);
      
      // Verify all upgraded modules are active
      expect(await upgradedPluginProxy.HAS_UPGRADED_VOLATILITY()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_DYNAMIC_FEE()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_FARMING()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_ALM()).to.equal(true);
      expect(await upgradedPluginProxy.HAS_UPGRADED_SECURITY()).to.equal(true);
      
      expect(await upgradedPluginProxy.hasUpgradedVolatilityImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedDynamicFeeImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedFarmingImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedAlmImpl.staticCall()).to.equal(true);
      expect(await upgradedPluginProxy.hasUpgradedSecurityImpl.staticCall()).to.equal(true);
      
      // Set states in various modules
      await upgradedPluginProxy.connect(ownerSigner).setAdvancedFeeMode(true);
      expect(await upgradedPluginProxy.getAdvancedFeeMode.staticCall()).to.equal(true);
      
      await upgradedPluginProxy.connect(ownerSigner).setFarmingPausedMode(true);
      expect(await upgradedPluginProxy.getFarmingPausedMode.staticCall()).to.equal(true);
      await upgradedPluginProxy.connect(ownerSigner).setFarmingPausedMode(false);
      
      await upgradedPluginProxy.connect(ownerSigner).setAlmAdvancedMode(true);
      expect(await upgradedPluginProxy.getAlmAdvancedMode.staticCall()).to.equal(true);
      
      await upgradedPluginProxy.connect(ownerSigner).setSecurityEmergencyMode(true);
      expect(await upgradedPluginProxy.getSecurityEmergencyMode.staticCall()).to.equal(true);
      await upgradedPluginProxy.connect(ownerSigner).setSecurityEmergencyMode(false);
      
      // Perform swap to generate oracle data
      const swapAmount = ethers.parseEther('100');
      const token1Before = await token1.balanceOf(ownerSigner.address);
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount, deadline);
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      const timepointIndexBefore = await upgradedPluginProxy.timepointIndex();
      const lastTimestampBefore = await upgradedPluginProxy.lastTimepointTimestamp();
      const volatilityDataBefore = await upgradedPluginProxy.getSingleTimepoint(0);
      
      expect(timepointIndexBefore).to.be.gt(0);
      expect(volatilityDataBefore.tickCumulative).to.not.equal(0n);
      
      // Downgrade
      const result = await deployNewPluginImplementation(
        'AlgebraUpgradeablePlugin',
        algebraFactory,
        newPluginFactory
        
      );
      
      // Downgrade to base plugin
      await newPluginFactory.connect(ownerSigner).upgradePlugins(result.address);
      
      const implementationAfterDowngrade = await beacon.implementation();
      expect(implementationAfterDowngrade).to.equal(result.address);
      
      const poolPluginAfter = await pool.plugin();
      expect(poolPluginAfter).to.equal(pluginAddress);
      
      const basePlugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
      // Verify oracle data persisted after downgrade
      const timepointIndexAfter = await basePlugin.timepointIndex();
      const lastTimestampAfter = await basePlugin.lastTimepointTimestamp();
      const volatilityDataAfter = await basePlugin.getSingleTimepoint(0);
      
      expect(timepointIndexAfter).to.equal(timepointIndexBefore);
      expect(lastTimestampAfter).to.equal(lastTimestampBefore);
      expect(volatilityDataAfter.tickCumulative).to.not.equal(0n);
      
     
      // Perform swap after downgrade to verify basic functionality still works
      const swapAmount2 = ethers.parseEther('100');
      const token1Before2 = await token1.balanceOf(ownerSigner.address);
      await performSwap(swapRouter, deployer, ownerSigner, token0, token1, swapAmount2, deadline);
      
      const token1After2 = await token1.balanceOf(ownerSigner.address);
      const swapOutput2 = token1After2 - token1Before2;
      
      expect(swapOutput2).to.be.gt(0);
      
      // Verify oracle continues to accumulate data with base implementation
      const newTimepointIndex = await basePlugin.timepointIndex();
      expect(newTimepointIndex).to.be.gt(timepointIndexBefore);
      
      const volatilityDataFinal = await basePlugin.getSingleTimepoint(0);
      expect(volatilityDataFinal.tickCumulative).to.not.equal(0n);
      
      // Verify base oracle functions still work
      const isInitialized = await basePlugin.isInitialized();
      expect(isInitialized).to.equal(true);

     // Verify upgraded module functions are NO LONGER available
      
      const superPluginProxy = await ethers.getContractAt('MockSuperUpgradedPlugin', pluginAddress);
      await expect(
        superPluginProxy.getAdvancedFeeMode.staticCall()
      ).to.be.reverted;  

      await expect(
        superPluginProxy.getSecurityEmergencyMode.staticCall()
      ).to.be.reverted; 

      await expect(
        superPluginProxy.getFarmingPausedMode.staticCall()
      ).to.be.reverted;  

      

      // Verify base security function still works (if implemented)
      const securityRegistry = await basePlugin.getSecurityRegistry();
      expect(securityRegistry).to.not.be.undefined;
    })
  })
});
