import { expect } from 'chai';
import { artifacts } from 'hardhat';

import { ALGEBRA_PLUGIN_PROXY, BEACON_PROXY_DEPLOYER } from 'test-utils/pinnedProxy';

// The plugin reads the pool address out of its proxy's runtime code at a fixed offset, which only
// holds under the production optimizer settings, so the specs deploy the proxy from bytecode pinned
// in test-utils rather than from a fresh artifact - see pinnedProxy.ts for the whole story.
//
// A pinned blob goes stale silently, so this compares it against a fresh compile. It is excluded from
// coverage runs, where the fresh artifact is compiled without the optimizer and differs by design.
describe('pinned proxy bytecode [ @skip-on-coverage ]', function () {
  for (const pinned of [ALGEBRA_PLUGIN_PROXY, BEACON_PROXY_DEPLOYER]) {
    it(`${pinned.contractName} still matches a fresh compile`, async function () {
      const fresh = await artifacts.readArtifact(pinned.contractName);

      expect(fresh.bytecode).to.equal(pinned.bytecode);
      expect(fresh.deployedBytecode).to.equal(pinned.deployedBytecode);
    });
  }
});
