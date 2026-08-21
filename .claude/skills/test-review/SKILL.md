---
name: test-review
description: Review Hardhat/Mocha test coverage for a plugin package (or the current diff) in this monorepo, run actual coverage tooling, and propose concrete new test cases — toward 100% coverage, and past it into the states and call sequences coverage tooling can't see. Read-only, no code changes, no fluff. Use when asked to review tests, check test coverage, or find missing test cases for a package/contract.
allowed-tools: Read, Glob, Grep, Bash
---

# Test review

Analyze existing tests for a package and report gaps as a prioritized list. Never restate what the code or the existing test already does — only say what's missing or wrong. The failure mode to avoid is under-reporting: a review that stops at whatever the coverage table happened to highlight leaves the interesting cases for someone else to find later.

## Scope

Ask which package/contract if it isn't given (e.g. `packages/limit-order`, `packages/whitelist-fee-discount`). If the user is pointing at a diff/PR, review only the changed contracts and their existing spec files under `packages/<pkg>/test/*.spec.ts`.

Two facts about how this repo is laid out change what a review can honestly claim:

- **A package may have no `test/` directory at all.** Coverage tooling has nothing to run, so the review is not a table: it is one line naming the package's production contracts and the fact that none of them is exercised anywhere. Check with `git ls-files packages/<pkg>/test` before running anything — `ls` also shows build leftovers from other branches.
- **The shared base package the plugins inherit from carries no suite of its own.** Everything a plugin gets from the base layer — its pool wiring, the manager role, module registration, the delegatecall helper — is therefore only ever covered incidentally, through whichever feature package's specs happen to exercise it. When you credit inherited behavior as covered, name the spec doing the covering; when you cannot, that is a finding.

Two more checks apply to a diff review specifically:

- **A change that fixes a bug needs a test that would fail without it.** A test that merely exercises the new code path is not the same thing. Say what the regression test has to reproduce — the reported symptom and the conditions it needed — not just which function to call.
- **A change that alters what the contract guarantees invalidates assertions written against the old guarantee.** A tolerance introduced, a bound loosened, a constant retuned: every existing assertion that pinned the old promise is a `[WEAK]` finding, including ones in spec files the diff never touched.

## Process

1. Run coverage for real numbers: `cd packages/<pkg> && npx hardhat coverage`. `@nomicfoundation/hardhat-toolbox` (which bundles `solidity-coverage`) is a single root devDependency shared by every package via the pnpm workspace, so this works from any package directory even though it isn't a package.json script. Read the terminal summary table (columns: `% Stmts`, `% Branch`, `% Funcs`, `% Lines`, `Uncovered Lines`, one row per contract) — this is the objective baseline, not a guess.
   - **`solidity-coverage` instruments the bytecode, and that instrumentation can make otherwise-passing tests revert** (seen in practice: gas/selector-sensitive proxy calls tripping over instrumented code). If a test fails only under `coverage` and not under plain `npx hardhat test`, that's a tooling artifact, not a bug — verify with `npx hardhat test --grep '<test name>'` before ever reporting it as broken, and don't let a coverage-run failure abort the review; the coverage table still gets written even when some tests fail. **Every contract those tests exercise is then understated in that table** — a contract whose only tests failed can show 0% branches and a list of uncovered lines that are in fact covered. Work out which rows the failing tests feed and say so explicitly instead of reporting those numbers as gaps.
2. Read the contract(s) under `packages/<pkg>/contracts/` — every external/public function, revert condition, event, and access-control modifier is a candidate for a test. **Exclude `contracts/test/*.sol`** (mocks, `Mock*`, `*Test.sol` harness contracts) from this pass — they're test infrastructure, not production code, and their coverage numbers are not part of the target.
3. Read the existing `*.spec.ts` files for that package and match each contract behavior to an existing `it(...)`.
4. Cross-reference: anything the coverage run marked uncovered in a production contract, anything with no matching test, and anything with only a happy-path test, are findings.
5. **Second pass — states and sequences, not just functions.** Steps 2-4 enumerate the contract's *functions*. This pass enumerates the *states its stored data can be in* and the *orders its operations can run in*. Coverage tooling is blind here: reaching a new state normally re-executes lines some existing test already covered, so a package can sit at 100% on every column and still have never tested its most consequential behavior. Run this pass on every review, and treat a clean coverage table as the reason to run it rather than permission to skip it. For each production contract, work through three questions:
   - **Which stored values change, and what are their degenerate settings?** Zero, one-sided, empty, saturated, maximal, equal-to-each-other. For each one, ask whether any test performs an operation *while the contract is in that state* — not merely one that produces the state and then asserts and stops.
   - **What can change underneath the contract without anyone calling it?** Another contract's state moving (a pool price crossing a range, an oracle answer updating, an exchange rate drifting), a direct token transfer in, time passing, a role revoked elsewhere. These states are unreachable by any test that only calls this contract's own functions, which is exactly why they are the most commonly missed. A test here usually looks like: set up → drive the *external* actor → assert this contract's view of the world → then call one of its functions and assert it behaves correctly from there.
   - **Which operations can run back to back?** The same one twice, two different ones in either order, an operation on the result of the previous one. Single-call tests never cover the handoff between them.
6. Check whether a case is covered at one layer but not the one above it. A library or math contract having a unit test for a boundary does not mean the composed contract that consumes it has ever been driven into that boundary end to end. Both are real, distinct behaviors, and the integration-level one is where the composition bugs live.

## What counts as a finding

### Coverage-visible — the function pass finds these

- Public/external function with no test at all.
- Revert condition (`require`, custom error, `onlyOwner`-style modifier) never asserted with `.to.be.reverted` / `.to.be.revertedWith(...)` / `.to.be.revertedWithCustomError(...)`.
- Event never asserted with `.to.emit(...)`.
- Untested boundary values (zero address, zero amount, max uint, empty arrays, same-value no-op calls).
- A state-dependent branch only exercised in one direction — e.g. a fee discount tested at 30/50/100% but never at the invalid/out-of-range end.
- Access control asserted on only one side — denied or allowed, but not both. Both shapes are used in this repo (one `it` pairing deny-then-grant, or separate `it`s per role); either is fine, the finding is only ever a missing *side*, never the shape. See `test-add`'s SKILL.md for which to write.
- Upgrade and initialization paths. A sibling `Upgradeable*.spec.ts` should exist and cover double-initialize and unauthorized-upgrade. For a beacon-upgradeable plugin the *upgrade itself* is a separate surface again, normally a `*.upgrade.spec.ts`: actually swapping the beacon's implementation, then checking that every stored field survives it one by one, that the swap reaches proxies deployed before it, that the plugin-manager role and the Algebra factory owner are both refused (only the beacon owner may upgrade), and that each composed module still works afterwards. Absent storage-preservation coverage is a finding on its own — no amount of proxy-behavior testing reaches it.
- Any line/branch the coverage run reports as uncovered that corresponds to reachable, meaningful behavior (not dead code).

### Coverage-invisible — the state/sequence pass finds these, and reviews routinely miss them

These touch no new line, so nothing in the coverage table points at them. They are still the highest-value findings a review produces, because they are the ones nobody stumbles into by chasing a number.

- **A state only an external actor can create.** The contract's stored data is untouched, but the world it reads from moved: a pool price crossed one of its ranges, an oracle re-answered, a balance was donated in, time advanced. Both halves are findings — what the contract now reports while sitting in that state, and how its next operation behaves when started from it.
- **An operation performed *while* in a degenerate state**, as opposed to a test that merely arrives at the state. If a value can become zero, one-sided, empty or saturated, then every operation that can be called next from there is an untested path, including the ones that end up doing nothing at all.
- **A sequence of operations**: the same call twice (idempotency, or correct rejection the second time), two calls in the reverse order, one call on top of the state the previous one produced.
- **An invariant that has to hold across an operation, not at a single point in time.** Value conservation across a burn-and-remint or a migration, stored fields that must be provably untouched by an unrelated action, monotonicity, a bound on how much may be left stranded. A test that only asserts the end state never checks these, and they are what catches a whole class of accounting bug.
- **A boundary covered in a unit-level spec but never in the integration path that consumes it** — see step 6 of the process.
- **A behavior tested only against a mock where the real collaborator would behave differently.** Note it when the mock is doing the work the assertion claims to be testing.
- **Assertions that are too strict, not just too weak.** A test pinning an exact value the contract never actually guarantees (an exact zero where the implementation deliberately keeps a rounding buffer or leaves dust, an exact gas or timestamp) is a future false failure. Report it as `[WEAK]` with the guarantee the contract actually makes.
- **A data-driven corpus that only partly runs.** Where a suite expands recorded transactions from a JSON file into one case each, the loop is often capped with a `.slice(0, N)` for runtime. It reports green while every record past the cap is never executed. Say how many are being skipped and whether the cap still earns its keep.
- **Tests that are skipped, `.only`-scoped, or knowingly red.** A `describe.skip` / `it.skip` / commented-out block, or a suite documented as failing on purpose, is a coverage hole with a note attached. Say what it would need in order to be re-enabled.

## Coverage target — 100% of production contracts is the floor, not the finish line

Treat 100% line/branch coverage of `packages/<pkg>/contracts/` (excluding `contracts/test/*.sol`) as the baseline, and cite the actual percentage from the coverage run. But every finding still has to correspond to a real, distinct behavior — never propose a test whose only purpose is to touch a line without asserting anything new: no re-running an already-tested happy path with a behaviorally-equivalent input, no calling a trivial getter with no assertion, no duplicate `it` that exercises the same branch an existing test already exercises, and no chasing coverage on `contracts/test/*.sol` mocks.

**That anti-padding rule is about duplicate behavior, not about the number of findings, and it is not a licence to stop early.** A distinct state, a distinct sequence, or a distinct invariant is a distinct behavior even when it re-executes lines that are already green — those are the findings the coverage table structurally cannot show you. Reaching 100% is therefore the moment the state/sequence pass becomes the whole job, never the moment to report "nothing to flag". A review that returns only line-coverage findings on a package already at or near 100% has almost certainly not run that pass.

If the last uncovered lines/branches are genuinely unreachable in practice (a defensive `require`/`assert` the compiler won't dead-code-eliminate, an interface method required by inheritance but never callable in this context, etc.), say so explicitly as the reason coverage stops short of 100% instead of inventing a test to force the number up.

## Before reporting — self-check

Do not report until each of these has an answer:

- Did the state/sequence pass actually run, or did the findings all come from the coverage table?
- For every contract: is there at least one test where its state was moved by something other than a call to it? If the contract reads any external state at all and the answer is no, that is a finding, not an oversight.
- Which of the proposed cases are actually writable with infrastructure that already exists? Check `contracts/test/*.sol` harnesses and `test-utils` before assuming a scenario is impractical — mocks whose state can be driven directly, swap/callee helpers, and math helpers exposing internals are usually already there, and a finding is much more likely to be acted on when it names the helper that makes it a short test. If a case genuinely needs new infrastructure, say so in the finding instead of dropping it.
- Is any proposed case a rewording of an existing `it`? Drop it. Is any *existing* `it` asserting something the contract does not guarantee? That is a `[WEAK]` finding.

## Output format

No preamble, no restating the task, no closing summary. Start with the coverage numbers, then a flat list, most important first:

```
Coverage: <lines>% lines / <branches>% branches / <functions>% functions — packages/<pkg>/contracts (excl. contracts/test)

[MISSING] <Contract>.<function> — <what's untested> (suggested: <one-line test idea>)
[SCENARIO] <Contract> — <state or sequence never tested; how it's reached> (suggested: <one-line test idea>)
[WEAK] <existing test name> — <what it fails to assert, or what it over-asserts>
[SKIPPED] <test or describe name> — <why it's disabled and what re-enabling it needs>
[UNREACHABLE] <file>:<line> — <why it can't realistically be covered, so it's excluded from the target>
[COVERAGE-ARTIFACT] <test name> — fails under `hardhat coverage` but passes under `hardhat test`; not a real bug
```

`[SCENARIO]` findings are the point of the second pass, so state how the scenario is reached, not just that it's missing — which external actor moves what, or which two calls run in which order. A one-line idea a reader can hand straight to `test-add`.

Reporting nothing beyond the coverage numbers is a legitimate outcome only after the state/sequence pass has run and come up empty. Say which passes ran when you report it, in one line, and stop.

## Do not

- Do not edit files or write test code — that's the `test-add` skill's job. If the user wants a suggested case implemented, say so and offer to switch to `test-add`.
- Do not comment on code style, gas, or security issues unrelated to test coverage — that's `code-review` / `security-review`.
