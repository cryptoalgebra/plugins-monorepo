import { expect } from 'chai';
import { network, config } from 'hardhat';

// Two network settings in the root hardhat.base.config.ts govern every package's test run, since
// every package takes `networks` from it verbatim, and neither announces itself when it stops
// applying. The `hardfork` key replaced an `evm` key that hardhat silently ignored, which left every
// run on the latest fork while the contracts compile for paris; a second rename would be ignored the
// same way. And `initialDate` is what keeps the clock reproducible now that the network no longer
// boots on a pinned fork block. Reading them back is the only thing that fails when either one is
// misspelled away. The compiler setting below is this package's own rather than shared, and it is
// there because it is the half of the pair that gives `hardfork` its meaning.
describe('hardhat network configuration', () => {
  it('runs on the EVM version the contracts are compiled for', () => {
    // paris is what solc calls it, merge is what hardhat calls the same fork
    for (const compiler of config.solidity.compilers) {
      expect(compiler.settings.evmVersion).to.equal('paris');
    }
    expect(network.config.hardfork).to.equal('merge');
  });

  it('starts every run from the same instant', () => {
    expect((network.config as any).initialDate).to.equal('2026-01-14T11:49:07Z');
  });

  it('does not boot on a fork', () => {
    // Only the integration suite needs one, and it establishes the fork itself in its before hook
    expect((network.config as any).forking).to.equal(undefined);
  });
});
