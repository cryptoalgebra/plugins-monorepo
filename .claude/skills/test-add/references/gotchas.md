# Gotchas

Referenced from `test-add`'s SKILL.md. Read this before writing a new fixture from scratch, and whenever a test fails in a way that doesn't look like your own logic is wrong — most of these entries were mistaken for a real bug at first.

**This file is a running log.** If you hit something during test-add work that cost real debugging time and could plausibly happen again — a non-obvious library behavior, a missing config entry, an environment quirk, anything you had to dig for the real cause of — add it as a new bullet before finishing the task, in the same shape as the existing entries: what the symptom looks like, why it happens, and the fix.

Two rules for adding entries:

- **Only what you hit yourself and verified.** No speculative "this might also happen" guesses.
- **Only what generalizes to this repo.** A trap in shared infrastructure (`test-utils`, hardhat config, the pool/plugin interaction) belongs here. A one-off quirk of a single contract belongs in a comment in that contract's own spec file.

Don't put dates, file counts, or "last touched" claims in this file — they rot silently and no one re-checks them. Describe behavior, not census data.

## Known gotchas when writing new fixtures

- **`createPool()` / `computeAddress()`** (in `test-utils/externalFixtures`) assume the two tokens are already sorted by address, the way `tokensFixture()` returns them. Pass your own tokens in whatever order you happened to deploy them and the pool can attach to an address nothing was ever deployed at — the symptom is `Transaction reverted: function returned an unexpected amount of data` on some later call, not on `createPool()` itself, so it's easy to misdiagnose. Sort by address before calling: `BigInt(await tokenA.getAddress()) < BigInt(await tokenB.getAddress()) ? [tokenA, tokenB] : [tokenB, tokenA]`.
- **`evm_snapshot` / `evm_revert`**: the returned snapshot id is single-use — `evm_revert` consumes it. If you're reverting to the same point across a loop of scenarios, reassign the id from `evm_snapshot`'s return value on every iteration; reusing a stale id doesn't error, it just silently does nothing, and state quietly leaks between "isolated" cases.
- **Missing `dependencyCompiler` entries**: the first time a package's tests need infrastructure (`BeaconProxyDeployer.sol` and similar) that no existing spec file in that package has needed yet, `ethers.getContractFactory('BeaconProxyDeployer')` fails with `HH700: Artifact for contract "BeaconProxyDeployer" not found`. Compare the package's `hardhat.config.ts` `dependencyCompiler.paths` against a sibling package that already has such tests and add whatever's missing.
- **Plugin mocks that don't implement the full `IAlgebraPlugin` hook surface** (a mock built for one specific interface, not the whole plugin ABI): triggering a real swap through a pool with that mock still wired as the plugin fails with `function selector was not recognized and there's no fallback function`, because the pool tries to call `beforeSwap`/`afterSwap` on it. Call `pool.setPluginConfig(0)` to disable hooks before the swap, matching the existing tests that already do real swaps.
- **`transferFrom`-based balance-shortfall fallbacks** (a pattern like `if (balance < amount) token.transferFrom(externalFunder, ...)`): the ERC20 `approve` has to target the contract that actually calls `transferFrom` — usually the plugin itself — not whatever it forwards the tokens to (the pool). Approving the wrong address fails with `ERC20: insufficient allowance` and can look like a balance problem at first glance.
- **`packages/default-plugin/test/integration/Integration.spec.ts`** is a mainnet-fork integration test, unlike every other spec file's plain mock-deploy fixture: it calls `ethers.getContractAt` against hardcoded Base addresses and `impersonateAccount`s the real factory owner. It depends on `networks.hardhat.forking` in the root `hardhat.base.config.ts`, which reads `ANKR_API_KEY` from the root `.env` and pins a block number. If it fails while every mock-based test passes, check fork reachability before treating it as a regression you caused.

## Testing private or internal functions directly

If the behavior you need to test is a `private` or `internal` function buried inside a stateful contract — not reachable through a clean public entry point without a lot of unrelated setup — don't force it through the full public flow, and don't copy its logic into a test file. A copy validates the copy, not the real function, and drifts silently when the original changes.

Instead: widen the visibility to `internal` (a no-op behavior change) and add a thin harness contract under `contracts/test/` that exposes a public passthrough. This repo already does this — see `packages/dynamic-fee/contracts/test/AdaptiveFeeTest.sol`, which wraps `AdaptiveFee` library calls behind plain external functions, and `packages/volatility-oracle/contracts/test/VolatilityOracleTest.sol`. Register the harness the same way its siblings are registered, and remember `contracts/test/*.sol` is excluded from coverage targets.
