import { ethers } from "hardhat";

export async function deployLimitOrderManager(
  algebraFactory: string,
  pluginFactory: string,
  wNativeToken: string,
  existingManager: string,
) {
  const core = await ethers.getContractAt("IAlgebraFactory", algebraFactory);
  const poolDeployer = await core.poolDeployer();
  let manager;
  if (existingManager === ethers.ZeroAddress) {
    manager = await (await ethers.getContractFactory("LimitOrderManager")).deploy(
      wNativeToken, poolDeployer, pluginFactory, algebraFactory,
    );
    await manager.waitForDeployment();
  } else {
    manager = await ethers.getContractAt("LimitOrderManager", existingManager);
  }

  // A manager is bound to one plugin factory, including for custom pools.
  const bindings = [
    [await manager.basePluginFactory(), pluginFactory],
    [await manager.factory(), algebraFactory],
    [await manager.poolDeployer(), poolDeployer],
    [await manager.wNativeToken(), wNativeToken],
  ];
  if (bindings.some(([actual, expected]) => actual.toLowerCase() !== expected.toLowerCase())) {
    throw new Error("LimitOrderManager immutables do not match this deployment");
  }
  console.log("LimitOrderManager:", await manager.getAddress());
  return manager;
}

export function requireAddress(value: string, name: string) {
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error(`Set config.${name} before deploying`);
  }
}
