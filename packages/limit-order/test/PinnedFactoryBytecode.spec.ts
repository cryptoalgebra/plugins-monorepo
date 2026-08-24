import { expect } from 'chai';
import { artifacts } from 'hardhat';

import PLUGIN_FACTORY_ARTIFACT from './pinned/UpgradeableLimitOrderTestPluginFactory.json';

// The harness plugin factory is deployed from pinned bytecode because it builds the plugin proxy with
// `new AlgebraPluginProxy` and the plugin reads the pool address out of that proxy at a fixed offset,
// see limitOrderFixture.ts. A pinned blob goes stale silently, so this compares it against a fresh
// compile. Excluded from coverage runs, where the fresh artifact differs by design.
describe('pinned factory bytecode [ @skip-on-coverage ]', () => {
  it(`${PLUGIN_FACTORY_ARTIFACT.contractName} still matches a fresh compile`, async () => {
    const fresh = await artifacts.readArtifact(PLUGIN_FACTORY_ARTIFACT.contractName);

    expect(fresh.bytecode).to.equal(PLUGIN_FACTORY_ARTIFACT.bytecode);
    expect(fresh.deployedBytecode).to.equal(PLUGIN_FACTORY_ARTIFACT.deployedBytecode);
  });
});
