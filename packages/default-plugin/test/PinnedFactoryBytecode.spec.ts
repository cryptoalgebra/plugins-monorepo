import { expect } from 'chai';
import { artifacts } from 'hardhat';

import { MOCK_TIME_PLUGIN_FACTORY } from './shared/pinnedFactory';

// The harness plugin factory is deployed from pinned bytecode, see shared/pinnedFactory.ts. A pinned
// blob goes stale silently, so this compares it against a fresh compile. Excluded from coverage runs,
// where the fresh artifact is compiled without the optimizer and differs by design.
describe('pinned factory bytecode [ @skip-on-coverage ]', () => {
  it(`${MOCK_TIME_PLUGIN_FACTORY.contractName} still matches a fresh compile`, async () => {
    const fresh = await artifacts.readArtifact(MOCK_TIME_PLUGIN_FACTORY.contractName);

    expect(fresh.bytecode).to.equal(MOCK_TIME_PLUGIN_FACTORY.bytecode);
    expect(fresh.deployedBytecode).to.equal(MOCK_TIME_PLUGIN_FACTORY.deployedBytecode);
  });
});
