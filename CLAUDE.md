# plugins-monorepo

Algebra Integral plugin packages. Solidity contracts plus Hardhat tests, one package per plugin.

## Layout

- pnpm workspace, one package per directory under `packages/*`.
- **Directory name is not the npm name.** `packages/access-list` is `@cryptoalgebra/access-list-plugin`. Read the package's `package.json` before using any name-based command.
- `packages/test-utils` is private and never published. It holds shared mocks (`MockFactory`, `MockPool`, `MockERC20`) and helpers (`utilities`, `externalFixtures`, `snapshotGasCost`). Every other package depends on it as `workspace:^`.
- **`packages/` contains directories that are not in git.** Build leftovers from other branches (`artifacts/`, `cache/`, `typechain/`, `node_modules/` with no source). `ls packages/` is not the package list. Use `git ls-files packages/` to see what actually exists on this branch.

## Architecture

Every feature is a **module**, and a shipped plugin is a composition of modules. Three layers:

1. **`packages/abstract-plugin`** is the base. `AbstractPlugin` / `BaseAbstractPlugin` / `UpgradeableAbstractPlugin` (beacon proxy) give the plugin its pool wiring, `ALGEBRA_BASE_PLUGIN_MANAGER` role and `activeModules` list. `BaseConnector` provides the `_delegateCall` helper every module uses.

2. **Feature packages** (`access-list`, `dynamic-fee`, `alm`, `safety-switch`, ...) are the modules. Each ships the same triple:
   - `<Name>Connector.sol` — abstract, inherited by the composed plugin. Holds the implementation address as an immutable and forwards calls to it.
   - `<Name>PluginImplementation.sol` — the actual logic. Reached only by `delegatecall`, so it runs in the *plugin's* storage context, not its own.
   - `libraries/<Name>Storage.sol` — ERC-7201 namespaced storage (`erc7201:algebra.storage.<name>`), shared by connector and implementation. The namespace is what keeps modules from colliding in that shared storage. Never add a plain state variable to a connector.
   
   Some modules also ship a `<Name>Registry.sol`, a separate contract holding config shared across pools.

3. **`packages/default-plugin`** is the composition root, not a default implementation. `AlgebraUpgradeablePlugin` inherits `UpgradeableAbstractPlugin` plus the connectors it bundles (VolatilityOracle, DynamicFee, FarmingProxy, ALM, Security) and passes each implementation address into the constructor. Those addresses are immutables, so every beacon proxy shares them.

A module contributes its pool hook flags (`Plugins.BEFORE_SWAP_FLAG` and friends) and its name in `activeModules`. Adding a module to a plugin means inheriting its connector, calling its initializer, and OR-ing its config flags.

On this branch only `default-plugin` composes a shipped plugin. Modules like `access-list` and `permissioned-pools` are composed only by harnesses in their own `contracts/test/`. Customer-specific compositions live on other branches.

## Commands

Root:

```bash
pnpm -r test         # all packages
pnpm -r compile
pnpm lint            # solhint over packages/*/contracts
pnpm format          # prettier write
```

Single package, run from its directory:

```bash
cd packages/<dir> && npx hardhat test
cd packages/<dir> && npx hardhat compile
cd packages/<dir> && npx hardhat coverage
```

`pnpm --filter` takes the npm name, not the directory: `pnpm --filter @cryptoalgebra/access-list-plugin test`.

There is no `coverage` script in any `package.json`. `npx hardhat coverage` still works because `@nomicfoundation/hardhat-toolbox` is a root devDependency shared through the workspace.

## Build config

- Solidity `0.8.20` in every package. `evmVersion: paris`, optimizer on at 1,000,000 runs, `bytecodeHash: none`.
- Each package has its own `hardhat.config.ts` that imports the root `hardhat.base.config.ts` for networks, etherscan and typechain settings.
- Typechain output goes to `packages/<dir>/typechain`. Import contract types from there, never hand-write an interface.
- A contract from another workspace package or from OpenZeppelin is only compiled into a package's artifacts if it is listed in that package's `dependencyCompiler.paths`. A missing entry shows up as `HH700: Artifact for contract "X" not found`.
- The root `.env` supplies `ANKR_API_KEY`, `ETHERSCAN_API_KEY`, `MNEMONIC`, `INFURA_ID_PROJECT`. The hardhat network forks Base at a pinned block, so fork-based tests need a reachable RPC.

## Conventions

- Keep Solidity comments short. One short clause per line. Avoid em-dashes and semicolons. Comment the non-obvious "why", do not restate the code.
- `contracts/test/*.sol` is test-only infrastructure (mocks, `*Test.sol` harnesses). It is not production code and is excluded from coverage targets.
- Tests live in `packages/<dir>/test/*.spec.ts`. Two styles coexist. Use the `test-add` skill rather than guessing, and `test-review` for coverage gaps.

## Releases

Lerna with independent versioning, `npmClient: pnpm`. Version and publish from a `*-master` branch. `test-utils` is excluded from version bumps.
