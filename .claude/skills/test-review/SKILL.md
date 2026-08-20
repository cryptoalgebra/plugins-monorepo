---
name: test-review
description: Review Hardhat/Mocha test coverage for a plugin package (or the current diff) in this monorepo, run actual coverage tooling, and propose concrete new test cases toward 100% — without padding for the number. Read-only, no code changes, no fluff. Use when asked to review tests, check test coverage, or find missing test cases for a package/contract.
allowed-tools: Read, Glob, Grep, Bash
---

# Test review

Analyze existing tests for a package and report gaps as a short, prioritized list. Never restate what the code or the existing test already does — only say what's missing or wrong.

## Scope

Ask which package/contract if it isn't given (e.g. `packages/limit-order`, `packages/whitelist-fee-discount`). If the user is pointing at a diff/PR, review only the changed contracts and their existing spec files under `packages/<pkg>/test/*.spec.ts`.

## Process

1. Run coverage for real numbers: `cd packages/<pkg> && npx hardhat coverage`. Every package has `@nomicfoundation/hardhat-toolbox` (bundles `solidity-coverage`), so this works without extra setup even though it isn't a package.json script. Read the terminal summary table (columns: `% Stmts`, `% Branch`, `% Funcs`, `% Lines`, `Uncovered Lines`, one row per contract) — this is the objective baseline, not a guess.
   - **`solidity-coverage` instruments the bytecode, and that instrumentation can make otherwise-passing tests revert** (seen in practice: gas/selector-sensitive proxy calls tripping over instrumented code). If a test fails only under `coverage` and not under plain `npx hardhat test`, that's a tooling artifact, not a bug — verify with `npx hardhat test --grep '<test name>'` before ever reporting it as broken, and don't let a coverage-run failure abort the review; the coverage table still gets written even when some tests fail.
2. Read the contract(s) under `packages/<pkg>/contracts/` — every external/public function, revert condition, event, and access-control modifier is a candidate for a test. **Exclude `contracts/test/*.sol`** (mocks, `Mock*`, `*Test.sol` harness contracts) from this pass — they're test infrastructure, not production code, and their coverage numbers are not part of the target.
3. Read the existing `*.spec.ts` files for that package and match each contract behavior to an existing `it(...)`.
4. Cross-reference: anything the coverage run marked uncovered in a production contract, anything with no matching test, and anything with only a happy-path test, are findings.

## What counts as a finding

- Public/external function with no test at all.
- Revert condition (`require`, custom error, `onlyOwner`-style modifier) never asserted with `.to.be.reverted` / `.to.be.revertedWith(...)` / `.to.be.revertedWithCustomError(...)`.
- Event never asserted with `.to.emit(...)`.
- Untested boundary values (zero address, zero amount, max uint, empty arrays, same-value no-op calls).
- A state-dependent branch only exercised in one direction — e.g. a fee discount tested at 30/50/100% but never at the invalid/out-of-range end.
- Access control tested for only the denied side or only the allowed side, not both. This repo pairs them in one `it`: see `packages/whitelist-fee-discount/test/AlgebraFeeDiscountPlugin.spec.ts:145-150` (deny as `other`, grant the role, then assert both `other` and `wallet` succeed).
- Upgrade/initialization paths missing re-initialization or upgrade-authorization tests — several plugins have a sibling `Upgradeable*.spec.ts` file specifically for this; check it exists and covers double-initialize / unauthorized-upgrade.
- Any line/branch the coverage run reports as uncovered that corresponds to reachable, meaningful behavior (not dead code).
- A value computed by a pure math/library helper (rounded one way, e.g. floor) that is later consumed by a *different* call which may round or clamp differently — e.g. `LiquidityAmounts.getAmountsForLiquidity` (periphery, rounds down) feeding a budget for `IAlgebraPool.mint()` (core, may round/clamp differently). This is especially likely where one combined balance is split into a plan for two-or-more sequential real operations (mint a main position then a reserve position from the same leftover, swap then mint, etc.) — each step can eat into the margin the next step assumed. A pure unit test of the math helper checking only its own internal invariants (e.g. "never computes more than the amount given") does not catch this: the helper can be internally correct and the composition with the real call site still wrong. Check whether any test actually funds the *exact* computed amounts (zero slack) into the real contract and runs the full sequence, not just the helper in isolation. See `packages/price-convergence/test/PriceConvergenceVault.spec.ts` ("mints both positions cleanly even when funded to VaultMath's own tightest computed budget") for the pattern: repeatedly re-query the calculator with its own previously-returned "used" totals as the next input until it converges (reducing the budget can shift which side binds, so it isn't a single round-trip), fund the real contract with exactly that converged amount, then run the actual sequence and assert on outcome — don't assume it reverts or succeeds without running it, since a library that rounds conservatively enough may self-correct in practice. (`price-convergence` currently only exists on the `pc-vault-tests` branch, not yet on `master` — apply the pattern generally if that package isn't in your checkout.)
- A computed/"live" view function that has a cheaper, similarly-named sibling (a plain storage getter) which every existing test uses instead. Solidity auto-generates a public getter for any public state variable, and it's easy for tests to only ever read that one — checking a struct's raw stored fields (e.g. a position's `{lower, upper, liquidity}`) — while the *other* function that actually computes something from it (live token amounts, accrued fees, a derived total) never gets called by any test at all. Grep the contract for view/pure functions with no matching `it` anywhere, not just for functions the coverage table flags — a function that's short and branch-free can show 100% coverage from a single incidental call while never being asserted on for a *correct* result. Found in practice: `packages/price-convergence/contracts/vault/PriceConvergenceVault.sol`'s `mainPosition` (the plain public struct getter, used everywhere) vs `getMainPosition()` (computes live `amount0`/`amount1` including accrued fees via `_getPositionAmounts`) — every existing test read the former, so the latter's fee-inclusive math was completely unexercised. (Same branch caveat as above.)
- Value that only settles into observable state via an explicit "poke"/settlement call (trading fees on an LP position, streaming rewards, accrued-interest snapshots) — the *triggering* event (a swap, time passing) alone doesn't make it observable; something must also call whatever poke/collect/checkpoint function pulls it into a queryable balance. A test that merely performs the triggering event and then reads a "current value" view will see it still at its pre-poke value and wrongly conclude nothing accrued. Conversely, if the contract's own write paths always poke-and-immediately-collect in the same call (many vaults do, to keep share pricing correct), the "poked but not yet collected" state may not be reachable through any public function at all — don't force a test to catch that fleeting state; verify the mechanism through what actually is observable, e.g. that the collect call returns/moves a non-zero amount matching the balance delta. See `packages/price-convergence/test/PriceConvergenceVault.spec.ts` ("collects real trading fees earned by the main position") for a worked example against a real pool (same branch caveat as above).

## Coverage target — 100% of production contracts, never padded

Treat 100% line/branch coverage of `packages/<pkg>/contracts/` (excluding `contracts/test/*.sol`) as the goal, and cite the actual percentage from the coverage run. But every finding still has to correspond to a real, distinct behavior — never propose a test whose only purpose is to touch a line without asserting anything new: no re-running an already-tested happy path with a behaviorally-equivalent input, no calling a trivial getter with no assertion, no duplicate `it` that exercises the same branch an existing test already exercises, and no chasing coverage on `contracts/test/*.sol` mocks.

If the last uncovered lines/branches are genuinely unreachable in practice (a defensive `require`/`assert` the compiler won't dead-code-eliminate, an interface method required by inheritance but never callable in this context, etc.), say so explicitly as the reason coverage stops short of 100% instead of inventing a test to force the number up.

## Output format

No preamble, no restating the task, no closing summary. Start with the coverage numbers, then a flat list, most important first:

```
Coverage: <lines>% lines / <branches>% branches / <functions>% functions — packages/<pkg>/contracts (excl. contracts/test)

[MISSING] <Contract>.<function> — <what's untested> (suggested: <one-line test idea>)
[WEAK] <existing test name> — <what it fails to assert>
[UNREACHABLE] <file>:<line> — <why it can't realistically be covered, so it's excluded from the target>
[COVERAGE-ARTIFACT] <test name> — fails under `hardhat coverage` but passes under `hardhat test`; not a real bug
```

If there's genuinely nothing worth flagging beyond the coverage numbers, say so in one line and stop.

## Do not

- Do not edit files or write test code — that's the `test-add` skill's job. If the user wants a suggested case implemented, say so and offer to switch to `test-add`.
- Do not comment on code style, gas, or security issues unrelated to test coverage — that's `code-review` / `security-review`.
