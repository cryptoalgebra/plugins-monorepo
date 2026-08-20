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

1. Run coverage for real numbers: `cd packages/<pkg> && npx hardhat coverage`. `@nomicfoundation/hardhat-toolbox` (which bundles `solidity-coverage`) is a single root devDependency shared by every package via the pnpm workspace, so this works from any package directory even though it isn't a package.json script. Read the terminal summary table (columns: `% Stmts`, `% Branch`, `% Funcs`, `% Lines`, `Uncovered Lines`, one row per contract) — this is the objective baseline, not a guess.
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
- Access control asserted on only one side — denied or allowed, but not both. Both shapes are used in this repo (one `it` pairing deny-then-grant, or separate `it`s per role); either is fine, the finding is only ever a missing *side*, never the shape. See `test-add`'s SKILL.md for which to write.
- Upgrade/initialization paths missing re-initialization or upgrade-authorization tests — several plugins have a sibling `Upgradeable*.spec.ts` file specifically for this; check it exists and covers double-initialize / unauthorized-upgrade.
- Any line/branch the coverage run reports as uncovered that corresponds to reachable, meaningful behavior (not dead code).

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
