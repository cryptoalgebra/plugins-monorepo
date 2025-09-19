const hre = require('hardhat');

async function main() {

  const [deployer] = await hre.ethers.getSigners();

  const almFactoryAddress = "0x711F45548648dbf82C23CfB63E334EF375aCCD26";
  const poolAddress = "0x5500c2FfEBB0B0D03C39F6F39F31000C5ADA3bCA";
  const allowedTokenA = false;
  const allowedTokenB = true;
  const minTimeBetweenRebalances = 3600;
  const slowTwapPeriod = 3600;
  const fastTwapPeriod = 300;
  const feeRecipient = "0xDeaD1F5aF792afc125812E875A891b038f888258"; // partner's fee recipient address

  // struct Thresholds {
  //     uint16 depositTokenUnusedThreshold;
  //     uint16 simulate;
  //     uint16 normalThreshold;
  //     uint16 underInventoryThreshold;
  //     uint16 overInventoryThreshold;
  //     uint16 priceChangeThreshold;
  //     uint16 extremeVolatility;
  //     uint16 highVolatility;
  //     uint16 someVolatility;
  //     uint16 dtrDelta;
  //     uint16 baseLowPct;
  //     uint16 baseHighPct;
  //     uint16 limitReservePct;
  //   }

  const midVolatilitythresholds = [
    100,
    8800,
    8100,
    7500,
    8500,
    60,
    2500,
    1000,
    120,
    2000,
    1500,
    1200,
    200
  ];

  const pool = await hre.ethers.getContractAt('IAlgebraPool', poolAddress);
  const pluginAddress = await pool.plugin();
  const tokenA = await pool.token0();
  const tokenB = await pool.token1();
  console.log(tokenA, tokenB);

  const almFactory = await hre.ethers.getContractAt('@cryptoalgebra/alm-vault/contracts/interfaces/IAlgebraVaultFactory.sol:IAlgebraVaultFactory', almFactoryAddress);
  
  console.log('ALM Vault creation...');

  const vaultCreationTx = await almFactory.createAlgebraVault(tokenA, allowedTokenA, tokenB, allowedTokenB);
  
  await vaultCreationTx.wait();

  const vaultKey = await almFactory.genKey(deployer, tokenA, tokenB, allowedTokenA, allowedTokenB);
  const vaultAddress = await almFactory.getAlgebraVault(vaultKey);
  console.log('ALM Vault deployed at:', vaultAddress);
  
  const vault = await hre.ethers.getContractAt('IAlgebraVault', vaultAddress);

  console.log("Set fee recipient address");
  await (await vault.setAmmFeeRecipient(feeRecipient)).wait();
  
  const RebalanceManagerFactory = await hre.ethers.getContractFactory('RebalanceManager');
  const rebalanceManager = await RebalanceManagerFactory.deploy(
    vaultAddress,
    minTimeBetweenRebalances,
    midVolatilitythresholds
  );
  
  await rebalanceManager.waitForDeployment();
  const rebalanceManagerAddress = await rebalanceManager.getAddress();
  console.log('Rebalance Manager deployed at:', rebalanceManagerAddress);
  
  const setManagerTx = await vault.setRebalanceManager(rebalanceManagerAddress);
  await setManagerTx.wait();
  console.log('Rebalance Manager set in vault');
  
  if (pluginAddress !== hre.ethers.ZeroAddress) {
    const plugin = await hre.ethers.getContractAt('IAlmPlugin', pluginAddress);
    await plugin.initializeALM(rebalanceManagerAddress, slowTwapPeriod, fastTwapPeriod)
    console.log('Rebalance Manager set in plugin');
  } else {
    console.log('No plugin attached to pool');
  }
  
  await hre.run("verify:verify", {
    address: rebalanceManagerAddress,
    constructorArguments: [
        vaultAddress,
        minTimeBetweenRebalances,
        midVolatilitythresholds
    ],
  });

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
