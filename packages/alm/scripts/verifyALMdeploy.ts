const hre = require('hardhat');

async function main() {

  const poolAddress = "0x2f99c425eb7219e2a8c8545684d38f13ec5e46cb";

  console.log('🔍 Verifying ALM Setup for Pool:', poolAddress);
  console.log('===============================================\n');

  let hasErrors = false;

  try {
    // 1. Check pool exists and get basic info
    console.log('1. Pool Information:');
    const pool = await hre.ethers.getContractAt('IAlgebraPool', poolAddress);
    
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    const pluginAddress = await pool.plugin();
    
    console.log(`   ✓ Token0: ${token0}`);
    console.log(`   ✓ Token1: ${token1}`);
    console.log(`   ✓ Plugin: ${pluginAddress}`);

    // 2. Check plugin status
    console.log('\n2. Plugin Status:');
    if (pluginAddress === hre.ethers.ZeroAddress) {
      console.log('   ❌ No plugin attached to pool');
      hasErrors = true;
      return;
    } else {
      console.log('   ✓ Plugin attached');

      const plugin = await hre.ethers.getContractAt('IAlmPlugin', pluginAddress);
      
      // Check if plugin is initialized
      try {
        const slowTwap = await plugin.slowTwapPeriod();
        const fastTwap = await plugin.fastTwapPeriod();
        const manager = await plugin.rebalanceManager();
        if(slowTwap > 0 && fastTwap > 0 && manager !== hre.ethers.ZeroAddress) {
          console.log('   ✓ Plugin is initialized, fastTwap:', fastTwap, 'slowTwap:', slowTwap, 'rebalanceManager:', manager);
        } else {
          console.log('   ❌ Plugin is not properly initialized');
          hasErrors = true;
        }
      } catch (e) {
        console.log('   ⚠️  Plugin is not initialized');
        hasErrors = true;
      }
    }

    // 3. Get rebalance manager from plugin
    console.log('\n3. Rebalance Manager Status:');
    try {
      const plugin = await hre.ethers.getContractAt('IAlmPlugin', pluginAddress);
      const managerAddress = await plugin.rebalanceManager();
      
      if (managerAddress === hre.ethers.ZeroAddress) {
        console.log('   ❌ No rebalance manager set in plugin');
        hasErrors = true;
        return;
      }

      const manager = await hre.ethers.getContractAt('RebalanceManager', managerAddress);
      
      // Display thresholds in a readable format
      try {
        const thresholds = await manager.thresholds();
        console.log('   ✓ RebalanceManager thresholds:');
        console.log(`     - Deposit Token Unused: ${thresholds.depositTokenUnusedThreshold}`);
        console.log(`     - Simulate: ${thresholds.simulate}`);
        console.log(`     - Normal: ${thresholds.normalThreshold}`);
        console.log(`     - Under Inventory: ${thresholds.underInventoryThreshold}`);
        console.log(`     - Over Inventory: ${thresholds.overInventoryThreshold}`);
        console.log(`     - Price Change: ${thresholds.priceChangeThreshold}`);
        console.log(`     - Extreme Volatility: ${thresholds.extremeVolatility}`);
        console.log(`     - High Volatility: ${thresholds.highVolatility}`);
        console.log(`     - Some Volatility: ${thresholds.someVolatility}`);
        console.log(`     - DTR Delta: ${thresholds.dtrDelta}`);
        console.log(`     - Base Low Pct: ${thresholds.baseLowPct}`);
        console.log(`     - Base High Pct: ${thresholds.baseHighPct}`);
        console.log(`     - Limit Reserve Pct: ${thresholds.limitReservePct}`);
      } catch (e) {
        console.log('   ⚠️  Could not read thresholds details');
      }
      
      // 4. Get vault from rebalance manager
      console.log('\n4. Vault Status:');
      const vaultAddress = await manager.vault();
      
      if (vaultAddress === hre.ethers.ZeroAddress) {
        console.log('   ❌ No vault set in rebalance manager');
        hasErrors = true;
        return;
      }
      
      console.log(`   ✓ Vault address: ${vaultAddress}`);
      const vault = await hre.ethers.getContractAt('IAlgebraVault', vaultAddress);
      const vaultPool = await vault.pool();
      const vaultManager = await vault.rebalanceManager();
      const allowedTokenA = await vault.allowToken0();
      const allowedTokenB = await vault.allowToken1();
      const almFactoryAddress = await vault.algebraVaultFactory();
      
      console.log(`   ✓ Vault pool: ${vaultPool}`);
      console.log(`   ✓ Vault rebalance manager: ${vaultManager}`);
      console.log(`   ✓ Vault factory: ${almFactoryAddress}`);

      if(allowedTokenA) console.log(`   ✓ Vault allows token0 `);
      if(allowedTokenB) console.log(`   ✓ Vault allows token1 `);    

      // 5. Verify connections
      console.log('\n5. Connection Verification:');
      
      // Check manager-vault connection
      try {
        const managerVault = await manager.vault();
        if (managerVault.toLowerCase() === vaultAddress.toLowerCase()) {
          console.log('   ✓ Rebalance manager correctly connected to vault');
        } else {
          console.log('   ❌ Rebalance manager vault reference incorrect');
          hasErrors = true;
        }
      } catch (e) {
        console.log('   ⚠️  Could not verify manager-vault connection');
      }

      // Check vault-manager connection
      try {
        const vaultManager = await vault.rebalanceManager();
        if (vaultManager.toLowerCase() === managerAddress.toLowerCase()) {
          console.log('   ✓ Vault correctly connected to rebalance manager');
        } else {
          console.log('   ❌ Vault rebalance manager reference incorrect');
          hasErrors = true;
        }
      } catch (e) {
        console.log('   ⚠️  Could not verify vault-manager connection');
      }

    } catch (e) {
      console.log('   ❌ Error getting components from plugin/pool:', e.message);
      hasErrors = true;
    }

    // Summary
    console.log('\n📋 Verification Summary:');
    console.log('========================');
    if (hasErrors) {
      console.log('❌ ALM setup has issues that need to be addressed');
      process.exit(1);
    } else {
      console.log('✅ ALM setup appears to be correct');
      
      console.log('\n🎯 Setup Details:');
      console.log(`Pool: ${poolAddress}`);
      console.log(`Plugin: ${pluginAddress}`);
      console.log(`Tokens: ${token0} / ${token1}`);
    }

  } catch (error) {
    console.error('❌ Error during verification:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
