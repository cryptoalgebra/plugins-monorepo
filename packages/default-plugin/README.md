# Default plugin for Integral 1.3

The composition includes VolatilityOracle, DynamicFee, FarmingProxy, LimitOrder and Security. ALM remains a separate workspace package and is not included in this plugin.

## Deployment

From `packages/default-plugin`:

```sh
npx hardhat run scripts/deployUpgradeable.ts --network <network>
npx hardhat run scripts/deployCustomFactory.ts --network <network>
```

Set `algebraFactory` (or `entryPoint` for custom pools) and `wNativeToken` in the selected script. The scripts deploy `LimitOrderPluginImplementation` and `LimitOrderManager`, read `poolDeployer` from the core factory, and register the manager before switching the beacon to the new plugin. `hardhat.config.ts` explicitly compiles both limit-order contracts so their deployment artifacts exist.

Module implementations can be shared across compositions. Each manager is immutable-bound to one plugin factory proxy, core factory, pool deployer and wrapped native token. A custom factory therefore needs its own manager. The deployment helper checks these bindings when reusing a manager.

For Ignition, edit `ignition/modules/deployUpgradeable.ts` and provide the wrapped native token in a parameters file:

```json
{
  "AlgebraUpgradeablePluginFactoryDeployment": {
    "wNativeToken": "<wrapped native token address>"
  }
}
```

```sh
npx hardhat ignition deploy ignition/modules/deployUpgradeable.ts --parameters <parameters.json> --network <network>
```

`scripts/verifyUpgradeable.ts` includes verification of the manager and its four constructor arguments. The standalone script in `../limit-order/scripts/deployLimitOrderManager.ts` can deploy or register a replacement manager after the plugin factory exists.

## Existing deployments

`setLimitOrderManager` on a factory affects newly initialized plugins. It does not update existing plugin storage. After a beacon upgrade from the ALM composition, configure each existing plugin with `setLimitOrderManager(manager)` using `ALGEBRA_BASE_PLUGIN_MANAGER` or the core factory owner. Upgrade the factory implementation before creating plugins with the new composition: initialization reads the factory manager getter. The factory storage field is appended, preserving all previous fields.

The existing proxy bytecode compatibility restriction still applies: plugins read the pool immutable at a fixed bytecode offset. Do not upgrade deployments whose proxy layout uses a different offset. The Ignition upgrade modules describe this restriction.

## Limit-order compatibility review

Verified against the repository's pinned `@cryptoalgebra/integral-core` and `integral-periphery` **1.3.0-beta** dependencies, not an independently deployed or later core build:

- Hook signatures, `uint16` plugin flags and the six-field `globalState()` match the installed interfaces.
- Pool keys include the custom deployer. Address derivation and mint callback validation work for both default and custom pools.
- `afterSwap` forwards the final tick and swap direction. Orders fill through the real 1.3 pool's `burn`, and proceeds can be collected and withdrawn.
- The composed plugin keeps dynamic fees and farming active. Security gates order mints and burns. Cancelling an unfilled order works in `BURN_ONLY`.
- Manager configuration is copied during plugin initialization and survives beacon upgrades in its own storage namespace.

Existing operational limitations in `LimitOrderManager` remain:

- `afterSwap` scans every crossed interval, including empty ones. Gas grows with price movement divided by the manager tick spacing. Small spacing and large price jumps need network-specific gas testing.
- `setTickSpacing` does not reject zero or negative values. Use positive spacing. Changing spacing with outstanding orders can leave old ranges outside the scan. Keep the manager's spacing stable while those orders remain active.
- A nonzero manager that reverts will revert pool swaps. Clearing it stops automatic fills, so detach or replace it only with an explicit plan for outstanding orders.

`test/LimitOrderComposition.spec.ts` covers the full manager lifecycle using the shipped base plugin with real 1.3 core artifacts, both factory kinds, Security and Farming. The standalone limit-order suite additionally exercises native-token orders, partial cancellation, shared epochs and randomized operation sequences. This compatibility review does not constitute a full security audit.
