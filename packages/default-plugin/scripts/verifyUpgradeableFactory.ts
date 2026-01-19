import fs from 'fs';
import path from 'path';
import { ethers, run } from 'hardhat';

type DeploymentContractRecord = {
  address: string;
  constructorArgs?: any[];
};

type DeploymentFile = {
  network: { name: string; chainId: string };
  deployer: string;
  algebraFactory: string;
  createdAt: string;
  contracts: Record<string, DeploymentContractRecord>;
};

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function getLatestDeploymentFile(deploymentsDir: string, chainId: string): string {
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith('.json') && f.includes(`-${chainId}-`))
    .sort();

  if (files.length === 0) {
    throw new Error(`No deployment files found in ${deploymentsDir} for chainId=${chainId}`);
  }

  return path.join(deploymentsDir, files[files.length - 1]);
}

async function verifyNamedContract(
  name: string,
  contract: DeploymentContractRecord | undefined
): Promise<void> {
  if (!contract?.address) {
    console.log(`Skip: ${name} (missing)`);
    return;
  }

  const constructorArguments = contract.constructorArgs ?? [];

  try {
    await run('verify:verify', {
      address: contract.address,
      constructorArguments,
    });
    console.log(`Verified: ${name} (${contract.address})`);
  } catch (e: any) {
    const msg = (e?.message ?? String(e)) as string;
    if (
      msg.toLowerCase().includes('already verified') ||
      msg.toLowerCase().includes('contract source code already verified')
    ) {
      console.log(`Already verified: ${name} (${contract.address})`);
      return;
    }

    console.log(`Verify failed: ${name} (${contract.address})`);
    console.log(msg);
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();

  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  const fileArg = getArgValue('--file');
  const deploymentFile = fileArg
    ? path.isAbsolute(fileArg)
      ? fileArg
      : path.join(process.cwd(), fileArg)
    : getLatestDeploymentFile(deploymentsDir, chainId);

  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8')) as DeploymentFile;

  console.log('Network:', { name: network.name, chainId });
  console.log('Using deployment file:', deploymentFile);

  const contracts = deployment.contracts ?? {};

  // Implementations + registries + admin
  await verifyNamedContract('VolatilityOraclePluginImplementation', contracts.VolatilityOraclePluginImplementation);
  await verifyNamedContract('DynamicFeePluginImplementation', contracts.DynamicFeePluginImplementation);
  await verifyNamedContract('FarmingProxyPluginImplementation', contracts.FarmingProxyPluginImplementation);
  await verifyNamedContract('AlmPluginImplementation', contracts.AlmPluginImplementation);
  await verifyNamedContract('SecurityPluginImplementation', contracts.SecurityPluginImplementation);
  await verifyNamedContract('ReflexPluginImplementation', contracts.ReflexPluginImplementation);
  await verifyNamedContract('FeeDiscountPluginImplementation', contracts.FeeDiscountPluginImplementation);

  await verifyNamedContract('ProxyAdmin', contracts.ProxyAdmin);

  await verifyNamedContract('AlgebraUpgradeablePlugin', contracts.AlgebraUpgradeablePlugin);
  await verifyNamedContract('AlgebraUpgradeablePluginFactory', contracts.AlgebraUpgradeablePluginFactory);

  await verifyNamedContract('SecurityRegistry', contracts.SecurityRegistry);
  await verifyNamedContract('FeeDiscountRegistry', contracts.FeeDiscountRegistry);

  // Proxy (optional). Many teams skip verifying proxy bytecode.
  await verifyNamedContract('TransparentUpgradeableProxy', contracts.TransparentUpgradeableProxy);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
