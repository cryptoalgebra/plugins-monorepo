---
name: test-add
description: Write and add new Hardhat/Mocha/Chai test cases to this monorepo's Solidity plugin packages, matching whichever convention the target file already uses (or the current canonical style for new files). Use when asked to add tests, implement previously suggested test cases, or write coverage for a contract/function.
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

# Add tests

Write new `it(...)` cases (or new `describe` blocks / spec files) that match this repo's conventions exactly — don't introduce a new style.

## Two styles exist — know which one applies

This repo has an older convention and a newer one that has been replacing it, and **the split runs per file, not per package**: a new-style `Upgradeable*.spec.ts` often sits beside a legacy behavior spec. So never infer a file's style from its package or from which style is more common — check the file itself. A new-style file calls `loadFixture` inside each `it`; one with `#`-prefixed `describe`s and a `beforeEach` is legacy even when it imports `chai`.

```ts
// ✅ Canonical (newer) — use this for any new spec file
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('MyPlugin', function () {
  async function deployFixture() {
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();
    return { mockFactory };
  }

  it('should do the thing', async function () {
    const { mockFactory } = await loadFixture(deployFixture);
    // ...
  });
});
```

```ts
// ❌ Legacy — only write this style if you're EXTENDING a file already written this way
import { expect } from 'test-utils/expect';
import { MockFactory__factory } from '../typechain';

describe('#myMethod', () => {
  beforeEach('deploy test MyPlugin', async () => {
    mockFactory = await new MockFactory__factory(wallet).deploy();
  });
});
```

**Rule:**
- **Extending an existing spec file** → match that file's own style, whichever it is. Never mix styles within one file.
- **Writing a new spec file** (new contract, or a package that has no tests yet) → use the canonical style above. Treat it as canonical going forward.

## Canonical (newer) style for new spec files

| Aspect | Convention |
| --- | --- |
| Assertion library | `import { expect } from 'chai';` — not `test-utils/expect`, with the one exception below |
| Fixture loader | `import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';` (the `@nomicfoundation/hardhat-toolbox/network-helpers` re-export is equivalent — don't change existing imports) |
| Fixture location | Inline `async function deployFixture() { ... }` inside the top-level `describe` by default. See the `deployFixture` in `packages/permissioned-pools/test/PermissionedPoolPlugin.spec.ts` or `packages/access-list/test/AccessListRegistry.spec.ts`. Extract to a shared module only under the condition below |
| Contract factories | By string name — `ethers.getContractFactory('MockFactory')` — not imported typed `X__factory` classes |
| Fixture consumption | `const { ... } = await loadFixture(deployFixture);` at the top of each `it`, not in a `beforeEach` |
| Structure | Outer `describe('<ContractName>', function () {...})` → plain-English feature `describe`s (`'Deployment'`, `'Whitelist management'`, `'Authorization'`, `'Storage Isolation'` — no `#` prefix) → `it('should <behavior>', async function () {...})` |
| Revert assertions | The error the contract actually raises, read from its source rather than guessed: `.to.be.revertedWith('Initializable: contract is already initialized')` for a reason string, `.to.be.revertedWithCustomError(plugin, 'OnlyPool')` for a custom error (with `.withArgs(...)` when it carries arguments), `.to.be.revertedWithoutReason()` for a `require` with no message. Never a bare `.to.be.reverted` |
| Event assertions | `await expect(contract.fn()).to.emit(contract, 'EventName').withArgs(...)`, with the call inside `expect` and `await` in front of it |
| Boolean state | `.to.be.true` / `.to.be.false`, not `.to.equal(true)` |
| Parameterized cases | Generate them: `for (const factor of [500, 1000, 2000]) { it(\`... ${factor}\`, ...) }`, with the parameter in the title so a failure names the case. Established across the repo for grids of ticks, decimals pairs, fee factors and amount ratios. Prefer it over copy-pasting near-identical `it`s, and over a single `it` that loops internally and stops at the first bad case |

These conventions need more than a table row:

- **`test-utils/expect` is not merely a different import.** It is chai with `mocha-chai-jest-snapshot` already installed, so `.to.matchSnapshot()` is only guaranteed in files whose `expect` comes from there: the plugin registers on the one shared chai, so a plain-chai file can pass in a package run because another spec loaded it, then fail when run alone. A new-style file that needs a snapshot assertion should import `expect` from `test-utils/expect` — that is the one sanctioned exception to the row above, and the rest of the canonical style still applies. `snapshotGasCost` is unaffected either way: it pulls in its own plugin-enabled `expect` internally, so it works in a plain-chai file.
- **Access control** must always assert both sides — denied *and* allowed. Two shapes are in use and both are accepted: one `it` pairing deny-then-grant-then-allow (see `packages/whitelist-fee-discount/test/AlgebraFeeDiscountPlugin.spec.ts`), or separate `it`s per role (see `packages/access-list/test/AccessListRegistry.spec.ts`). Match whichever the file you're extending already uses. For a new file, prefer separate `it`s once there are 3+ roles to cover, since each failure then names the role it broke. This is the canonical rule — `test-review` defers here and only ever flags a missing side, not the shape.
- **A shared fixture file is correct once a second spec file needs the same setup.** Inline is the default and stays the default for a single-file package, but where a package's setup is heavy (a real pool plus tokens, a swap callee, a deployed plugin and its dependencies) and two or more spec files need it, the repo puts it in its own module and imports it — see `packages/limit-order/test/limitOrderFixture.ts` or `packages/default-plugin/test/shared/fixtures.ts`. Numbers those spec files share are exported from the same module rather than redeclared per file; repo-wide constants still come from `test-utils`. Don't copy a heavy fixture into a second spec file to satisfy the inline default; don't extract a five-line one either.
- **`Upgradeable*.spec.ts` files** in this style include, at minimum: initializes-with-correct-values, double-initialize reverts, default plugin config is correct, storage isolation between two proxies off the same beacon, immutables shared across proxies, and an authorization section (owner / manager role / rejected user). Use `packages/safety-switch/test/UpgradeableSecurityPlugin.spec.ts` as the full template when adding an `Upgradeable*.spec.ts` for a package that doesn't have one yet.
- **Upgrading itself is a separate spec.** `Upgradeable*.spec.ts` covers how the proxy behaves; a sibling `*.upgrade.spec.ts` covers what happens when the beacon's implementation is actually swapped, which no amount of proxy-behavior testing reaches. `packages/default-plugin/test/AlgebraUpgradeablePlugin.upgrade.spec.ts` is the template, and its sections are the checklist: proxies share one beacon and keep independent storage; only the beacon owner may upgrade (asserting that the plugin-manager role *and* the Algebra factory owner are both rejected, not just an anonymous caller); one upgrade propagates to every already-deployed proxy; **each stored field survives the swap**, checked one by one rather than in aggregate; previously-working functions still work and the new implementation's added ones appear; the factory reports the new implementation and hands it to proxies created afterwards; every composed module still functions; and writing the new implementation's own storage leaves every old field untouched, namespace by namespace and proxy by proxy. Write one when a package's plugin is beacon-upgradeable and the upgrade path is part of what ships.

## Reference files

Read these when they're relevant to the test you're writing — not speculatively on every invocation, but don't skip them when the situation applies:

- **`references/helpers-and-conventions.md`** — shared `test-utils` helpers, driving pool state, exact versus bounded assertions, snapshots, recorded-data corpora, property tests, heavy on-chain state, and time and coverage-tag conventions. Read before reaching for a generic EVM time-travel helper, before hand-rolling tick/fee-tier math, before moving the pool price or accruing fees, before comparing a struct-shaped return value, and before writing a `*.fuzz.spec.ts`, adding corpus records, or tagging a test for coverage.
- **`references/gotchas.md`** — non-obvious tooling behavior and repo-specific setup traps that cost real debugging time to work out, plus how to reach a `private`/`internal` function from a test via a `contracts/test/` harness. Read before writing a new fixture from scratch, whenever a test fails in a way that doesn't look like your own logic is wrong, and whenever a test survives the mutation in step 5.

**Keep `references/gotchas.md` current.** Before finishing, add anything that cost real debugging time and could recur, under the rules at the top of that file.

## Process

1. Find the target package's existing spec file(s) under `packages/<pkg>/test/`. If the contract already has a spec file, extend it in its existing style. If it doesn't, create a new one in the canonical (newer) style, mirroring the closest sibling package's file layout.
2. Add new cases inside the matching `describe` block by behavior — don't create a second `describe` for a method that already has one.
3. Run the package's tests after writing them: `cd packages/<pkg> && npx hardhat test`. (`pnpm --filter` also works but takes the *package name*, not the directory name — `pnpm --filter @cryptoalgebra/access-list-plugin test` for `packages/access-list`.) Fix failures before reporting done.
4. Run `npx hardhat coverage` for the package as well, whatever the test was for. It answers two different questions, and neither command substitutes for the other.
   - **Did the gap actually close?** Name the line or branch that flipped rather than saying the test "covers" something. A test that merely calls the function is not the same as one that reaches the previously-missing path; it may re-run a branch an existing test already ran.
   - **Is the test stable?** A coverage run executes a different set of specs, in a different order (`.solcover.js` filters `@skip-on-coverage` out), which is enough to surface an ordering dependency that `hardhat test` never shows. See `references/gotchas.md`. A test that holds under only one of the two commands is wrong, not the runner.
5. **Check that the new test actually bites, by breaking what it guards.** Covering a branch is not the same as discriminating it: a test can flip a branch counter while both arms compute the same value, and then it passes unchanged when the condition is inverted. So mutate the thing the test is supposed to catch — delete the `require`, invert the condition, swap the ternary — confirm the new test fails and the pre-existing ones do not, then restore. Choose inputs where the two arms genuinely differ; a boundary case where they coincide proves nothing. The same holds for operators: a zero or equal operand, or a quotient that divides evenly, hides a swapped `+`/`-` or a dropped rounding step. For a parameterised family, one sampled mutation is not enough: a compound condition and each end of a two-sided range hide each other, because they share a revert message. Back the file up first and confirm with `git diff` that it is byte-identical afterwards — the mutation is a measurement, never a change to ship.
6. **Treat every factual sentence in a comment as a claim, and either check it or turn it into an assertion.** The comments here carry a lot of load — why a guard exists, what a corpus contains, what the contract cannot do — and a wrong one is worse than none, because the next reader trusts it and the suite cannot contradict it. Three shapes to watch, all of which have shipped wrong here. A claim about the contract's structure ("nothing else writes this field") is usually one `grep` away from being checked, and is often better still as an extra assertion in the test: where a comment says a state cannot be recovered from, drive the calls that would recover it and assert it did not. A claim about a recorded corpus ("every record has both sides funded") is a query over the JSON, not a memory. And a claim about *why* a guard exists is worth replacing with the mechanical reason whenever there is one — "the subtraction below would underflow" is checkable, "the author wanted to avoid a pointless rebalance" is not.

## When the mock can't express the case

A scenario is sometimes untestable only because a `contracts/test/` mock answers too simply — one stored value where the real collaborator has several, or an answer that always divides evenly where the real one rarely does. Extending that mock is the right move, not a reason to drop the case: add the narrowest setter that makes the new state expressible, leave the existing default behavior untouched so no current test changes meaning, and say in a comment what real-world behavior the new knob stands in for. Mocks live under `contracts/test/` and are excluded from coverage targets, so this costs nothing in the numbers.

Do this deliberately, though. If the state you cannot reach is one the *production* contract cannot reach either, the finding is that the branch is unreachable — say so and move on rather than teaching a mock to fake it. Coverage cannot tell the two apart, since a faked state flips the branch either way: ask whether a real collaborator can produce the state the new knob fakes.

## Do not

- Do not restyle or reformat existing untouched tests, and do not migrate a file's style while adding unrelated test cases to it — that's a separate, deliberate task.
- Do not add new helpers to `test-utils` speculatively — it's shared across every package. Only add one there if it's genuinely reused 2+ times in the change you're making, and confirm with the user first.
