// Regenerates the pinned proxy artifacts in packages/test-utils/pinned.
//
// Run it against a package that compiles with the production solidity settings, after a plain
// `npx hardhat compile` in that package (never after `hardhat coverage`, which compiles with the
// optimizer off):
//
//   node packages/test-utils/scripts/regeneratePinned.js packages/access-list
//
// PinnedProxyBytecode.spec.ts fails if what is pinned here drifts from a fresh compile.
const fs = require('fs');
const path = require('path');

const SOURCES = {
  'AlgebraPluginProxy.json': '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol/AlgebraPluginProxy.json',
  'BeaconProxyDeployer.json': 'test-utils/contracts/test/BeaconProxyDeployer.sol/BeaconProxyDeployer.json',
};

const from = process.argv[2];
if (!from) {
  console.error('usage: node regeneratePinned.js <package dir with fresh artifacts>');
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'pinned');

for (const [outName, artifactPath] of Object.entries(SOURCES)) {
  const artifact = JSON.parse(fs.readFileSync(path.join(from, 'artifacts', artifactPath), 'utf8'));

  const pinned = {
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deployedBytecode: artifact.deployedBytecode,
  };

  fs.writeFileSync(path.join(outDir, outName), JSON.stringify(pinned, null, 2) + '\n');
  console.log(outName, (pinned.deployedBytecode.length - 2) / 2, 'runtime bytes');
}
