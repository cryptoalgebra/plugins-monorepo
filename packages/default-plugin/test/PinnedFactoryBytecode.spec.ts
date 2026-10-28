import { expect } from 'chai';
import { artifacts } from 'hardhat';

import { CUSTOM_PLUGIN_FACTORY, MOCK_TIME_PLUGIN_FACTORY } from './shared/pinnedFactory';

// The plugin factories are deployed from pinned bytecode, see shared/pinnedFactory.ts. A pinned
// blob goes stale silently, so this compares it against a fresh compile. Excluded from coverage runs,
// where the fresh artifact is compiled without the optimizer and differs by design.
describe('pinned factory bytecode [ @skip-on-coverage ]', () => {
  for (const pinned of [MOCK_TIME_PLUGIN_FACTORY, CUSTOM_PLUGIN_FACTORY]) {
    it(`${pinned.contractName} still matches a fresh compile`, async () => {
      const fresh = await artifacts.readArtifact(pinned.contractName);

      expect(fresh.bytecode).to.equal(pinned.bytecode);
      expect(fresh.deployedBytecode).to.equal(pinned.deployedBytecode);
    });
  }
});
