import { ethers, network } from 'hardhat';
import { expect } from 'test-utils/expect';
import { loadFixture, impersonateAccount, setBalance } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import * as helpers from "@nomicfoundation/hardhat-network-helpers";

const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

describe('Integration Tests - Fork', function() {
  async function deployFixture() {
    await helpers.mine()
    const algebraFactory = await ethers.getContractAt('IAlgebraFactory', '0x51a744E9FEdb15842c3080d0937C99A365C6c358');
    const nft = await ethers.getContractAt('INonfungiblePositionManager', '0x8aD26dc9f724c9A7319E0E25b907d15626D9a056');
    const swapRouter = await ethers.getContractAt('ISwapRouter', '0x5Cd40c7E21A15E7FC2503Fffd77cF70c60628F6C');
    const owner = await algebraFactory.owner();
    
    await impersonateAccount(owner);
    await setBalance(owner, ethers.parseEther('10'));
    
    const tokenFactory = await ethers.getContractFactory('TestERC20');
    const tokenAContract = await tokenFactory.deploy(ethers.parseEther('1000000000000000000'));
    const tokenBContract = await tokenFactory.deploy(ethers.parseEther('1000000000000000000'));
    
    const tokenAAddress = await tokenAContract.getAddress();
    const tokenBAddress = await tokenBContract.getAddress();
    
    
    const [token0Address, token1Address, token0, token1] = tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase()
      ? [tokenAAddress, tokenBAddress, tokenAContract, tokenBContract]
      : [tokenBAddress, tokenAAddress, tokenBContract, tokenAContract];
    
    
    const newPluginFactory = await ethers.getContractAt(
      'AlgebraUpgradeablePluginFactory',
      '0xc5eDF79ef0b1d3860445eD4f33933095DB5A6563'
    );
    
    
    const beaconAddress = await newPluginFactory.beacon();
    const beacon = await ethers.getContractAt('UpgradeableBeacon', beaconAddress);
    
    
    const ownerSigner = await ethers.getSigner(owner);
    await algebraFactory.connect(ownerSigner).setDefaultPluginFactory(await newPluginFactory.getAddress());
    
    return { 
      owner, 
      ownerSigner, 
      algebraFactory, 
      token0Address, 
      token1Address, 
      token0, 
      token1, 
      nft,
      swapRouter,
      newPluginFactory,
      beacon
    };
  }

  it('should deploy fixture', async () => {
    const { owner } = await loadFixture(deployFixture);
    console.log('Owner:', owner);
  });

  it('creates pool and adds liquidity', async () => {
    const { ownerSigner, algebraFactory, token0Address, token1Address, token0, token1, nft } = await loadFixture(deployFixture);
    
    
    await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
      token0Address, 
      token1Address, 
      ethers.ZeroAddress,
      "79228162514264337593543950336", 
      "0x"
    );
    
    const poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);
    const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
    
    
    const [deployer] = await ethers.getSigners();
    const mintAmount = ethers.parseEther('100000');
    await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
    await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
    
    
    const nftAddress = await nft.getAddress();
    await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
    await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
    
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const mintParams = {
      token0: token0Address,
      token1: token1Address,
      deployer: ethers.ZeroAddress,
      tickLower: -887220, 
      tickUpper: 887220,
      amount0Desired: mintAmount,
      amount1Desired: mintAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: ownerSigner.address,
      deadline: deadline
    };
    
    await nft.connect(ownerSigner).mint(mintParams);
    
    const reserves = await pool.getReserves();
    console.log('Pool reserves:', reserves);
    expect(reserves[0]).to.be.gt(0);
    expect(reserves[1]).to.be.gt(0);
  });

  

  it('performs swap on pool with upgradeable plugin', async () => {
    const { ownerSigner, algebraFactory, token0Address, token1Address, token0, token1, nft, swapRouter } = await loadFixture(deployFixture);
    
    
    await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
      token0Address, token1Address, ethers.ZeroAddress, "79228162514264337593543950336", "0x"
    );
    
    const poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);
    const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
    
    
    const [deployer] = await ethers.getSigners();
    const mintAmount = ethers.parseEther('100000');
    await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
    await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
    
    const nftAddress = await nft.getAddress();
    await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
    await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
    
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await nft.connect(ownerSigner).mint({
      token0: token0Address,
      token1: token1Address,
      deployer: ethers.ZeroAddress,
      tickLower: -887220,
      tickUpper: 887220,
      amount0Desired: mintAmount,
      amount1Desired: mintAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: ownerSigner.address,
      deadline: deadline
    });

    const liquidity = await pool.liquidity();
    expect(liquidity).to.be.gt(0);
    
    
    const swapAmount = ethers.parseEther('1000');
    await token0.connect(deployer).transfer(ownerSigner.address, swapAmount);
    
    
    const swapRouterAddress = await swapRouter.getAddress();
    await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
    
    const token0BalanceBefore = await token0.balanceOf(ownerSigner.address);
    const token1BalanceBefore = await token1.balanceOf(ownerSigner.address);

    await swapRouter.connect(ownerSigner).exactInputSingle({
      tokenIn: token0Address,
      tokenOut: token1Address,
      deployer: ethers.ZeroAddress,
      recipient: ownerSigner.address,
      deadline: deadline,
      amountIn: swapAmount,
      amountOutMinimum: 0,
      limitSqrtPrice: MIN_SQRT_RATIO + 1n
    });
    
    const token0BalanceAfter = await token0.balanceOf(ownerSigner.address);
    const token1BalanceAfter = await token1.balanceOf(ownerSigner.address);
    
    
    expect(token0BalanceBefore - token0BalanceAfter).to.be.gt(0);
    expect(token1BalanceAfter).to.be.gt(token1BalanceBefore);
    
    });

  describe('#Plugin Upgrade on Live Network', () => {
    let ownerSigner;
    let algebraFactory;
    let token0Address, token1Address;
    let token0, token1;
    let nft;
    let swapRouter;
    let newPluginFactory;
    let beacon;
    let pool, poolAddress, pluginAddress, plugin;
    let deployer;
    let mintAmount, swapAmount, swapSupply, deadline;
    let newImplAddress;
    let swapRouterAddress;
    let feeConfigBefore, poolBefore, factoryBefore, implementationBefore;
    let swapOutput1, token1Before1;
  
    
      
    beforeEach(async function(){
      const fixture = await loadFixture(deployFixture);
    
     
      ownerSigner = fixture.ownerSigner;
      algebraFactory = fixture.algebraFactory;
      token0Address = fixture.token0Address;
      token1Address = fixture.token1Address;
      token0 = fixture.token0;
      token1 = fixture.token1;
      nft = fixture.nft;
      swapRouter = fixture.swapRouter;
      newPluginFactory = fixture.newPluginFactory;
      beacon = fixture.beacon;
          
      // Create pool
      await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
        token0Address, token1Address, ethers.ZeroAddress, "79228162514264337593543950336", "0x"
      );
      
      poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);  
      pool = await ethers.getContractAt('IAlgebraPool', poolAddress); 
      pluginAddress = await pool.plugin();  
      plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);  
      
      
      [deployer] = await ethers.getSigners();  
      mintAmount = ethers.parseEther('100000000'); 
      await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
      await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
      
      const nftAddress = await nft.getAddress(); 
      await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
      await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
      
      deadline = Math.floor(Date.now() / 1000) + 3600;  
      await nft.connect(ownerSigner).mint({
        token0: token0Address,
        token1: token1Address,
        deployer: ethers.ZeroAddress,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: mintAmount,
        amount1Desired: mintAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: ownerSigner.address,
        deadline: deadline
      });
      
      
      swapSupply = ethers.parseEther('10000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      await token1.connect(deployer).transfer(ownerSigner.address, swapSupply);
    
      swapAmount = ethers.parseEther('1000');  
      swapRouterAddress = await swapRouter.getAddress();  
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 3n);
      
      token1Before1 = await token1.balanceOf(ownerSigner.address);  
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      const token1After1 = await token1.balanceOf(ownerSigner.address);  
      swapOutput1 = token1After1 - token1Before1;  
      
      expect(swapOutput1).to.be.gt(0);
      
      
      feeConfigBefore = await plugin.feeConfig.staticCall(); 
      poolBefore = await plugin.pool();  
      factoryBefore = await plugin.pluginFactory(); 
      implementationBefore = await beacon.implementation();  
      
      
      const mockFactoryAddress = await algebraFactory.getAddress();  
      const pluginFactoryAddress = await newPluginFactory.getAddress();  
      
      const volatilityImpl = '0x1f91b08eFE3B12326E703b2C587F5fcadB48f87b';
      const dynamicFeeImpl = '0x1BA71302d6bA5c14b79EbE96a0aCd02FCbA631F4';
      const farmingImpl = '0x982275D09E8530f4AA86713B3D8565EbE24B3cE3';
      const almImpl = '0x03A8A9b290FFC57617adbF6303a8Fb53cD704740';
      const securityImpl = '0x023D16f783cB0c8fB59f550D91DDda4e56AD130f';
      
      const newImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePlugin');
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        volatilityImpl,
        dynamicFeeImpl,
        farmingImpl,
        almImpl,
        securityImpl
      );
      
      newImplAddress = await newImpl.getAddress();  
      console.log('  New implementation deployed:', newImplAddress);
      console.log('  Old implementation:', implementationBefore);
    });
    it('Only ALGEBRA_BASE_PLUGIN_MANAGER or owner can upgrade plugin', async() =>{
      
      await expect(newPluginFactory.upgradePlugins(newImplAddress)).to.be.reverted;
    });

    it('reverts when upgrading to zero address', async () => {
      const { ownerSigner, newPluginFactory } = await loadFixture(deployFixture);
      
      await expect(
        newPluginFactory.connect(ownerSigner).upgradePlugins(ethers.ZeroAddress)
      ).to.be.reverted;
    });
    
    it('reverts when upgrading to non-contract address', async () => {
      const { ownerSigner, newPluginFactory } = await loadFixture(deployFixture);
      const [randomAddress] = await ethers.getSigners();
      
      await expect(
        newPluginFactory.connect(ownerSigner).upgradePlugins(randomAddress.address)
      ).to.be.reverted;
    });
    it('upgrades plugin implementation via beacon and swaps still work', async () => {
      
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newImplAddress);
      
      const implementationAfter = await beacon.implementation();
      console.log('   Beacon updated to:', implementationAfter);
      
     
      
      
      const pluginAfterUpgrade = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
      const feeConfigAfter = await pluginAfterUpgrade.feeConfig.staticCall();
      const poolAfter = await pluginAfterUpgrade.pool();
      const factoryAfter = await pluginAfterUpgrade.pluginFactory();
      
      expect(poolAfter).to.equal(poolBefore);
      expect(factoryAfter).to.equal(factoryBefore);
      expect(feeConfigAfter.baseFee).to.equal(feeConfigBefore.baseFee);
      
     
      
      
      
      const token1Before2 = await token1.balanceOf(ownerSigner.address);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      const token1After2 = await token1.balanceOf(ownerSigner.address);
      const swapOutput2 = token1After2 - token1Before2;
      
      
      expect(swapOutput2).to.be.gt(0);
      
      
      const outputRatio = Number(swapOutput2) / Number(swapOutput1);
      expect(outputRatio).to.be.gt(0.5).and.lt(2); 
      
    });

    it('multiple swaps work correctly after plugin upgrade', async () => {
      
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newImplAddress);
      
      
      const swapSupply = ethers.parseEther('10000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      await token1.connect(deployer).transfer(ownerSigner.address, swapSupply);
      
      
      const swapAmount = ethers.parseEther('500');
      const swapRouterAddress = await swapRouter.getAddress();
      
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 10n);
      await token1.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 10n);
      
      for (let i = 0; i < 3; i++) {
      
        const balance0Before = await token0.balanceOf(ownerSigner.address);
        const balance1Before = await token1.balanceOf(ownerSigner.address);
        
        await swapRouter.connect(ownerSigner).exactInputSingle({
          tokenIn: token0Address,
          tokenOut: token1Address,
          deployer: ethers.ZeroAddress,
          recipient: ownerSigner.address,
          deadline: deadline,
          amountIn: swapAmount,
          amountOutMinimum: 0,
          limitSqrtPrice: MIN_SQRT_RATIO + 1n
        });
        
        const balance1After = await token1.balanceOf(ownerSigner.address);
        expect(balance1After).to.be.gt(balance1Before);
        
        
        await swapRouter.connect(ownerSigner).exactInputSingle({
          tokenIn: token1Address,
          tokenOut: token0Address,
          deployer: ethers.ZeroAddress,
          recipient: ownerSigner.address,
          deadline: deadline,
          amountIn: swapAmount / 2n,
          amountOutMinimum: 0,
          limitSqrtPrice: MAX_SQRT_RATIO - 1n  
        });
        
        const balance0After = await token0.balanceOf(ownerSigner.address);
        expect(balance0After).not.to.equal(balance0Before);
      }
      
    });
  });
  describe('#Upgrade plugin with upgraded module', ()=> {
    it('upgrades security module and new functions work while plugin stays attached to pool', async () => {
      
      const { 
        ownerSigner, 
        algebraFactory, 
        token0Address, 
        token1Address, 
        token0, 
        token1, 
        nft, 
        swapRouter,
        newPluginFactory,
        beacon
      } = await loadFixture(deployFixture);
      
      
      await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
        token0Address, token1Address, ethers.ZeroAddress, "79228162514264337593543950336", "0x"
      );
      
      const poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);
      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      const pluginAddress = await pool.plugin();
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
   
      const [deployer] = await ethers.getSigners();
      const mintAmount = ethers.parseEther('100000');
      await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
      await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
      
      const nftAddress = await nft.getAddress();
      await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
      await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await nft.connect(ownerSigner).mint({
        token0: token0Address,
        token1: token1Address,
        deployer: ethers.ZeroAddress,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: mintAmount,
        amount1Desired: mintAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: ownerSigner.address,
        deadline: deadline
      });
      
      expect(await pool.plugin()).to.equal(pluginAddress);
      
      
      const swapSupply = ethers.parseEther('5000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      
      const swapAmount = ethers.parseEther('100');
      const swapRouterAddress = await swapRouter.getAddress();
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      
      
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      const upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();
      const upgradedSecurityAddress = await upgradedSecurityImpl.getAddress();
      
      
      const mockFactoryAddress = await algebraFactory.getAddress();
      const pluginFactoryAddress = await newPluginFactory.getAddress();
      
      
      const volatilityImpl = '0x1f91b08eFE3B12326E703b2C587F5fcadB48f87b';
      const dynamicFeeImpl = '0x1BA71302d6bA5c14b79EbE96a0aCd02FCbA631F4';
      const farmingImpl = '0x982275D09E8530f4AA86713B3D8565EbE24B3cE3';
      const almImpl = '0x03A8A9b290FFC57617adbF6303a8Fb53cD704740';
      
      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        volatilityImpl,
        dynamicFeeImpl,
        farmingImpl,
        almImpl,
        upgradedSecurityAddress  
      );
      
      const newPluginAddress = await newPluginImpl.getAddress();
      
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newPluginAddress);
      
      const implementationAfter = await beacon.implementation();
      expect(implementationAfter).to.equal(newPluginAddress);
      
      
      const poolPluginAfter = await pool.plugin();
      expect(poolPluginAfter).to.equal(pluginAddress);
      
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', pluginAddress);
      
      
      expect(await upgradedPlugin.HAS_UPGRADED_SECURITY()).to.equal(true);
      
      expect(await upgradedPlugin.hasUpgradedSecurityImpl.staticCall()).to.equal(true);
      
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(false);
      
      await upgradedPlugin.connect(ownerSigner).setSecurityEmergencyMode(true);
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(true);
      
      await upgradedPlugin.connect(ownerSigner).setSecurityEmergencyMode(false);
      expect(await upgradedPlugin.getSecurityEmergencyMode.staticCall()).to.equal(false);
      
      const statsResult = await upgradedPlugin.getSecurityCheckStats.staticCall();
      
      
      
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
      const token1Before = await token1.balanceOf(ownerSigner.address);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      const statsAfterSwap = await upgradedPlugin.getSecurityCheckStats.staticCall();
      expect(statsAfterSwap.checkCount).to.be.gt(statsResult.checkCount);
      
    });
  });
  describe('#Storage Collision test', () => {
    it('verifies no storage collision after security module upgrade', async () => {
      const { 
        ownerSigner, 
        algebraFactory, 
        token0Address, 
        token1Address, 
        token0, 
        token1, 
        nft, 
        swapRouter,
        newPluginFactory,
        beacon
      } = await loadFixture(deployFixture);
      
      
      
      
      
      
      const SecurityRegistryFactory = await ethers.getContractFactory('MockSecurityRegistry');
      const securityRegistry = await SecurityRegistryFactory.deploy();
      const securityRegistryAddress = await securityRegistry.getAddress();
      
      await newPluginFactory.connect(ownerSigner).setSecurityRegistry(securityRegistryAddress);
      
      
      
      
      await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
        token0Address, token1Address, ethers.ZeroAddress, "79228162514264337593543950336", "0x"
      );
      
      const poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);
      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      const pluginAddress = await pool.plugin();
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
  
      const securityRegistryBefore = await plugin.getSecurityRegistry();
      expect(securityRegistryBefore).to.equal(securityRegistryAddress);
      expect(securityRegistryBefore).to.not.equal(ethers.ZeroAddress);
      
      const rebalanceManagerBefore = await plugin.rebalanceManager();
      const incentiveBefore = await plugin.incentive();
      const feeConfigBefore = await plugin.feeConfig();
      
      
      const [deployer] = await ethers.getSigners();
      const mintAmount = ethers.parseEther('100000');
      await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
      await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
      
      const nftAddress = await nft.getAddress();
      await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
      await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await nft.connect(ownerSigner).mint({
        token0: token0Address,
        token1: token1Address,
        deployer: ethers.ZeroAddress,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: mintAmount,
        amount1Desired: mintAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: ownerSigner.address,
        deadline: deadline
      });
      
      const swapSupply = ethers.parseEther('5000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      
      const swapAmount = ethers.parseEther('100');
      const swapRouterAddress = await swapRouter.getAddress();
      
      for (let i = 0; i < 3; i++) {
        await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
        await swapRouter.connect(ownerSigner).exactInputSingle({
          tokenIn: token0Address,
          tokenOut: token1Address,
          deployer: ethers.ZeroAddress,
          recipient: ownerSigner.address,
          deadline: deadline,
          amountIn: swapAmount,
          amountOutMinimum: 0,
          limitSqrtPrice: MIN_SQRT_RATIO + 1n
        });
      }
      
      const isInitializedBefore = await plugin.isInitialized();
      const timepointIndexBefore = await plugin.timepointIndex();
      const lastTimestampBefore = await plugin.lastTimepointTimestamp();
      
      const volatilityBefore = await plugin.getSingleTimepoint(0);
      
      
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      const upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();
      const upgradedSecurityAddress = await upgradedSecurityImpl.getAddress();
      
      const mockFactoryAddress = await algebraFactory.getAddress();
      const pluginFactoryAddress = await newPluginFactory.getAddress();
      
      const volatilityImpl = '0x1f91b08eFE3B12326E703b2C587F5fcadB48f87b';
      const dynamicFeeImpl = '0x1BA71302d6bA5c14b79EbE96a0aCd02FCbA631F4';
      const farmingImpl = '0x982275D09E8530f4AA86713B3D8565EbE24B3cE3';
      const almImpl = '0x03A8A9b290FFC57617adbF6303a8Fb53cD704740';
      
      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        volatilityImpl,
        dynamicFeeImpl,
        farmingImpl,
        almImpl,
        upgradedSecurityAddress  
      );
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(await newPluginImpl.getAddress());
      
      
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
      
      const volatilityAfter = await upgradedPlugin.getSingleTimepoint(0);
      expect(volatilityAfter.tickCumulative).to.not.equal(0n);
      
      
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
      
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      const statsAfterSwap = await upgradedPlugin.getSecurityCheckStats.staticCall();
      expect(statsAfterSwap.checkCount).to.be.gt(0);
      
      const newTimepointIndex = await upgradedPlugin.timepointIndex();
      expect(newTimepointIndex).to.be.gt(timepointIndexBefore);
      
      expect(await upgradedPlugin.getSecurityRegistry()).to.equal(securityRegistryAddress);
    
    });
  });
  describe('#Upgrade plugin with upgraded FarmingProxy module', () => {
    it('upgrades FarmingProxy module and new functions work while plugin stays attached', async () => {
      const { 
        ownerSigner, 
        algebraFactory, 
        token0Address, 
        token1Address, 
        token0, 
        token1, 
        nft, 
        swapRouter,
        newPluginFactory,
        beacon
      } = await loadFixture(deployFixture);
      
      
      await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
        token0Address, token1Address, ethers.ZeroAddress, "79228162514264337593543950336", "0x"
      );
      
      const poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);
      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      const pluginAddress = await pool.plugin();
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
      const [deployer] = await ethers.getSigners();
      const mintAmount = ethers.parseEther('100000');
      await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
      await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
      
      const nftAddress = await nft.getAddress();
      await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
      await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await nft.connect(ownerSigner).mint({
        token0: token0Address,
        token1: token1Address,
        deployer: ethers.ZeroAddress,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: mintAmount,
        amount1Desired: mintAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: ownerSigner.address,
        deadline: deadline
      });
      
      
      const swapSupply = ethers.parseEther('5000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      
      const swapAmount = ethers.parseEther('100');
      const swapRouterAddress = await swapRouter.getAddress();
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      
      const UpgradedFarmingImplFactory = await ethers.getContractFactory('MockUpgradedFarmingProxyPluginImplementation');
      const upgradedFarmingImpl = await UpgradedFarmingImplFactory.deploy();
      const upgradedFarmingAddress = await upgradedFarmingImpl.getAddress();
      
      const mockFactoryAddress = await algebraFactory.getAddress();
      const pluginFactoryAddress = await newPluginFactory.getAddress();
      
      const volatilityImpl = '0x1f91b08eFE3B12326E703b2C587F5fcadB48f87b';
      const dynamicFeeImpl = '0x1BA71302d6bA5c14b79EbE96a0aCd02FCbA631F4';
      const almImpl = '0x03A8A9b290FFC57617adbF6303a8Fb53cD704740';
      const securityImpl = '0x023D16f783cB0c8fB59f550D91DDda4e56AD130f';
      
      
      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewFarming');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        volatilityImpl,
        dynamicFeeImpl,
        upgradedFarmingAddress,  
        almImpl,
        securityImpl
      );
      
      const newPluginAddress = await newPluginImpl.getAddress();
      
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(newPluginAddress);
      
      const implementationAfter = await beacon.implementation();
      expect(implementationAfter).to.equal(newPluginAddress);
      
      
      const poolPluginAfter = await pool.plugin();
      expect(poolPluginAfter).to.equal(pluginAddress);
      
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPluginWithNewFarming', pluginAddress);
      
      
      expect(await upgradedPlugin.HAS_UPGRADED_FARMING()).to.equal(true);
      expect(await upgradedPlugin.hasUpgradedFarmingImpl.staticCall()).to.equal(true);
      
      expect(await upgradedPlugin.getFarmingPausedMode.staticCall()).to.equal(false);
      
      await upgradedPlugin.connect(ownerSigner).setFarmingPausedMode(true);
      expect(await upgradedPlugin.getFarmingPausedMode.staticCall()).to.equal(true);
      
      await upgradedPlugin.connect(ownerSigner).setFarmingPausedMode(false);
      expect(await upgradedPlugin.getFarmingPausedMode.staticCall()).to.equal(false);
      
      const statsResult = await upgradedPlugin.getFarmingUpdateStats.staticCall();
      
      
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
      const token1Before = await token1.balanceOf(ownerSigner.address);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      
    });
  });
  describe('#Super Upgrade - ALL Modules V2', () => {
    it('upgrades ALL 5 modules simultaneously and all work together', async () => {
      const { 
        ownerSigner, 
        algebraFactory, 
        token0Address, 
        token1Address, 
        token0, 
        token1, 
        nft, 
        swapRouter,
        newPluginFactory,
        beacon
      } = await loadFixture(deployFixture);
      
      // Create pool and add liquidity
      await nft.connect(ownerSigner).createAndInitializePoolIfNecessary(
        token0Address, token1Address, ethers.ZeroAddress, "79228162514264337593543950336", "0x"
      );
      
      const poolAddress = await algebraFactory.poolByPair(token0Address, token1Address);
      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      const pluginAddress = await pool.plugin();
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      
      const [deployer] = await ethers.getSigners();
      const mintAmount = ethers.parseEther('100000');
      await token0.connect(deployer).transfer(ownerSigner.address, mintAmount);
      await token1.connect(deployer).transfer(ownerSigner.address, mintAmount);
      
      const nftAddress = await nft.getAddress();
      await token0.connect(ownerSigner).approve(nftAddress, mintAmount);
      await token1.connect(ownerSigner).approve(nftAddress, mintAmount);
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await nft.connect(ownerSigner).mint({
        token0: token0Address,
        token1: token1Address,
        deployer: ethers.ZeroAddress,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: mintAmount,
        amount1Desired: mintAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: ownerSigner.address,
        deadline: deadline
      });
      
      
      const swapSupply = ethers.parseEther('5000');
      await token0.connect(deployer).transfer(ownerSigner.address, swapSupply);
      
      const swapAmount = ethers.parseEther('100');
      const swapRouterAddress = await swapRouter.getAddress();
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount * 3n);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      
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
      
      
      const mockFactoryAddress = await algebraFactory.getAddress();
      const pluginFactoryAddress = await newPluginFactory.getAddress();
      
      
      const SuperPluginFactory = await ethers.getContractFactory('MockSuperUpgradedPlugin');
      const superPlugin = await SuperPluginFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        await upgradedVolatility.getAddress(),   
        await upgradedDynamicFee.getAddress(),   
        await upgradedFarming.getAddress(),      
        await upgradedAlm.getAddress(),          
        await upgradedSecurity.getAddress()      
      );
      
      
      await newPluginFactory.connect(ownerSigner).upgradePlugins(await superPlugin.getAddress());
      
      const implementationAfter = await beacon.implementation();
      expect(implementationAfter).to.equal(await superPlugin.getAddress());
      
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
      
      
      await token0.connect(ownerSigner).approve(swapRouterAddress, swapAmount);
      const token1Before = await token1.balanceOf(ownerSigner.address);
      
      await swapRouter.connect(ownerSigner).exactInputSingle({
        tokenIn: token0Address,
        tokenOut: token1Address,
        deployer: ethers.ZeroAddress,
        recipient: ownerSigner.address,
        deadline: deadline,
        amountIn: swapAmount,
        amountOutMinimum: 0,
        limitSqrtPrice: MIN_SQRT_RATIO + 1n
      });
      
      const token1After = await token1.balanceOf(ownerSigner.address);
      const swapOutput = token1After - token1Before;
      
      expect(swapOutput).to.be.gt(0);
      
      
      
      const farmingStats = await upgradedPluginProxy.getFarmingUpdateStats.staticCall();
      const securityStats = await upgradedPluginProxy.getSecurityCheckStats.staticCall();
      
      
      expect(securityStats.checkCount).to.be.gt(0);
      
      
    });
  });
});
