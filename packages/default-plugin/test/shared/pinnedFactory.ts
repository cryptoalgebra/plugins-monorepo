import { ethers } from 'hardhat';

import MOCK_TIME_PLUGIN_FACTORY_ARTIFACT from '../pinned/NewMockTimeUpgradeablePluginFactory.json';

/// Pinned bytecode for the harness plugin factory, for the same reason as packages/test-utils/pinnedProxy.ts.
///
/// This harness inherits AlgebraUpgradeablePluginFactory, so it carries the inherited
/// `new AlgebraPluginProxy(...)` inside its own compilation unit. Under `hardhat coverage` that unit
/// compiles without the optimizer, the proxy's pool immutable moves, and every pool driven case in this
/// package reverts OnlyPool(). Deploying the harness from pinned bytecode gives it a production layout
/// proxy while AlgebraUpgradeablePlugin, the contract these specs are actually measuring, stays
/// instrumented behind the beacon.
///
/// AlgebraUpgradeablePluginFactory keeps its own coverage through AlgebraUpgradeablePluginFactory.spec.ts,
/// which deploys the real contract rather than this harness.
export const MOCK_TIME_PLUGIN_FACTORY = MOCK_TIME_PLUGIN_FACTORY_ARTIFACT;

export async function pinnedMockTimePluginFactory() {
  return ethers.getContractFactory(MOCK_TIME_PLUGIN_FACTORY.abi, MOCK_TIME_PLUGIN_FACTORY.bytecode);
}
