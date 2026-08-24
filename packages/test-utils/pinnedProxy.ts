import { ethers } from 'hardhat';

import AlgebraPluginProxyArtifact from './pinned/AlgebraPluginProxy.json';
import BeaconProxyDeployerArtifact from './pinned/BeaconProxyDeployer.json';

/// Pinned copies of the two contracts that produce plugin proxies in tests, compiled with the
/// production solidity settings and deployed from that bytecode instead of from a fresh artifact.
///
/// UpgradeableAbstractPlugin._getPool() reads the pool address out of the proxy's own runtime code at
/// POOL_ADDRESS_OFFSET, which only holds for those settings. `hardhat coverage` forces the optimizer
/// off for every compilation job, which moves the immutable: the proxy grows from 457 to 542 bytes and
/// the address lands at offset 130, so every hook reverts OnlyPool() and whole spec files die in their
/// before hooks. Deploying the proxy from pinned bytecode keeps it identical to production while
/// everything actually under test stays instrumented and measurable.
///
/// This does not reach plugins created by a production factory: AlgebraUpgradeablePluginFactory builds
/// its proxies with `new AlgebraPluginProxy(...)` inside its own compilation unit, so default-plugin is
/// unaffected by any of this.
///
/// Regenerate with `node packages/test-utils/scripts/regeneratePinned.js <package>` after a plain
/// compile. The drift guard spec fails if these fall behind the sources.
export const ALGEBRA_PLUGIN_PROXY = AlgebraPluginProxyArtifact;
export const BEACON_PROXY_DEPLOYER = BeaconProxyDeployerArtifact;

/// ContractFactory for AlgebraPluginProxy, a drop-in for ethers.getContractFactory('AlgebraPluginProxy').
export async function pinnedPluginProxyFactory() {
  return ethers.getContractFactory(ALGEBRA_PLUGIN_PROXY.abi, ALGEBRA_PLUGIN_PROXY.bytecode);
}

/// ContractFactory for BeaconProxyDeployer, which stands in for a plugin factory and embeds the
/// proxy's creation code, so pinning it pins the proxy it produces.
export async function pinnedProxyDeployerFactory() {
  return ethers.getContractFactory(BEACON_PROXY_DEPLOYER.abi, BEACON_PROXY_DEPLOYER.bytecode);
}

export async function deployPinnedProxyDeployer() {
  return (await pinnedProxyDeployerFactory()).deploy();
}
