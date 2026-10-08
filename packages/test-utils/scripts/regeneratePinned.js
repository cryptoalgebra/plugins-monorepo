// Regenerates the pinned artifacts that tests deploy instead of a fresh compile.
//
// Run it after a plain `npx hardhat compile` in each source package (never after `hardhat coverage`,
// which compiles with the optimizer off). Without arguments it regenerates every target:
//
//   node packages/test-utils/scripts/regeneratePinned.js [test-utils] [default-plugin] [limit-order]
//
// The PinnedProxyBytecode and PinnedFactoryBytecode specs fail if a pinned blob drifts from a fresh compile.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const TARGETS = {
  // The proxy and the deployer that embeds it, read from a package that compiles both with production settings
  'test-utils': {
    from: 'packages/access-list',
    out: 'packages/test-utils/pinned',
    artifacts: {
      'AlgebraPluginProxy.json': '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol/AlgebraPluginProxy.json',
      'BeaconProxyDeployer.json': 'test-utils/contracts/test/BeaconProxyDeployer.sol/BeaconProxyDeployer.json',
    },
  },
  // Harness factories that build the proxy with `new AlgebraPluginProxy` in their own compilation unit
  'default-plugin': {
    from: 'packages/default-plugin',
    out: 'packages/default-plugin/test/pinned',
    artifacts: {
      'NewMockTimeUpgradeablePluginFactory.json':
        'contracts/test/factories/NewMockTimeUpgradeablePluginFactory.sol/NewMockTimeUpgradeablePluginFactory.json',
    },
  },
  'limit-order': {
    from: 'packages/limit-order',
    out: 'packages/limit-order/test/pinned',
    artifacts: {
      'UpgradeableLimitOrderTestPluginFactory.json':
        'contracts/test/UpgradeableLimitOrderTestPluginFactory.sol/UpgradeableLimitOrderTestPluginFactory.json',
    },
  },
};

const names = process.argv.slice(2);
const unknown = names.filter((name) => !TARGETS[name]);
if (unknown.length) {
  console.error(`unknown target: ${unknown.join(', ')}\nknown: ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

for (const name of names.length ? names : Object.keys(TARGETS)) {
  const { from, out, artifacts } = TARGETS[name];

  for (const [outName, artifactPath] of Object.entries(artifacts)) {
    const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, from, 'artifacts', artifactPath), 'utf8'));

    const pinned = {
      contractName: artifact.contractName,
      sourceName: artifact.sourceName,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
    };

    fs.writeFileSync(path.join(ROOT, out, outName), JSON.stringify(pinned, null, 2) + '\n');
    console.log(`${name}/${outName}`, (pinned.deployedBytecode.length - 2) / 2, 'runtime bytes');
  }
}
