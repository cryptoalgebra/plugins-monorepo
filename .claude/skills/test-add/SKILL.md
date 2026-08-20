---
name: test-add
description: Write and add new Hardhat/Mocha/Chai test cases to this monorepo's Solidity plugin packages, matching whichever convention the target file already uses (or the current canonical style for new files). Use when asked to add tests, implement previously suggested test cases, or write coverage for a contract/function.
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

# Add tests

Write new `it(...)` cases (or new `describe` blocks / spec files) that match this repo's conventions exactly — don't introduce a new style.

## Two styles exist — know which one applies

This repo has an older convention and a newer one that has been replacing it. Legacy files still outnumber new-style ones overall, but every package added or reworked most recently uses the new style, and so do most `Upgradeable*.spec.ts` files. Check the target file rather than assuming — `grep -l "from 'chai'" packages/*/test/*.spec.ts` lists the new-style ones.

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
| Assertion library | `import { expect } from 'chai';` — not `test-utils/expect` |
| Fixture loader | `import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';` (the `@nomicfoundation/hardhat-toolbox/network-helpers` re-export is equivalent — don't change existing imports) |
| Fixture location | Inline `async function deployFixture() { ... }` inside the top-level `describe` — no separate `<name>Fixture.ts` file. See `packages/permissioned-pools/test/PermissionedPoolPlugin.spec.ts:5-13`, `packages/access-list/test/AccessListRegistry.spec.ts:5-32` |
| Contract factories | By string name — `ethers.getContractFactory('MockFactory')` — not imported typed `X__factory` classes |
| Fixture consumption | `const { ... } = await loadFixture(deployFixture);` at the top of each `it`, not in a `beforeEach` |
| Structure | Outer `describe('<ContractName>', function () {...})` → plain-English feature `describe`s (`'Deployment'`, `'Whitelist management'`, `'Authorization'`, `'Storage Isolation'` — no `#` prefix) → `it('should <behavior>', async function () {...})` |
| Revert assertions | The actual require/revert string: `.to.be.revertedWith('Not authorized')`, `.to.be.revertedWith('Initializable: contract is already initialized')`. Check the contract's `require(...)` message and match it exactly rather than guessing |
| Event assertions | `.to.emit(contract, 'EventName').withArgs(...)` |
| Boolean state | `.to.be.true` / `.to.be.false`, not `.to.equal(true)` |

Two conventions need more than a table row:

- **Access control** must always assert both sides — denied *and* allowed. Two shapes are in use and both are accepted: one `it` pairing deny-then-grant-then-allow (see `packages/whitelist-fee-discount/test/AlgebraFeeDiscountPlugin.spec.ts`), or separate `it`s per role (see `packages/access-list/test/AccessListRegistry.spec.ts`). Match whichever the file you're extending already uses. For a new file, prefer separate `it`s once there are 3+ roles to cover, since each failure then names the role it broke. This is the canonical rule — `test-review` defers here and only ever flags a missing side, not the shape.
- **`Upgradeable*.spec.ts` files** in this style include, at minimum: initializes-with-correct-values, double-initialize reverts, default plugin config is correct, storage isolation between two proxies off the same beacon, immutables shared across proxies, and an authorization section (owner / manager role / rejected user). Use `packages/safety-switch/test/UpgradeableSecurityPlugin.spec.ts` as the full template when adding an `Upgradeable*.spec.ts` for a package that doesn't have one yet.

## Reference files

Read these when they're relevant to the test you're writing — not speculatively on every invocation, but don't skip them when the situation applies:

- **`references/helpers-and-conventions.md`** — shared `test-utils` helpers, snapshot-style assertions, and conventions for time-dependent/gas-cost tests. Read before reaching for a generic EVM time-travel helper, before hand-rolling tick/fee-tier math, or before comparing a struct-shaped contract return value.
- **`references/gotchas.md`** — non-obvious tooling behavior and repo-specific setup traps that cost real debugging time to work out, plus how to reach a `private`/`internal` function from a test via a `contracts/test/` harness. Read before writing a new fixture from scratch, and whenever a test fails in a way that doesn't look like your own logic is wrong.

**Keep `references/gotchas.md` current.** If something during a test-add task costs real debugging time and could plausibly recur — a non-obvious library behavior, a missing config entry, an environment quirk, anything you had to dig for the real cause of — add it there as a new bullet before finishing, in the same shape as the existing entries (symptom → cause → fix). Only add what you've actually verified by hitting it yourself, not speculative "this might also happen" guesses.

## Process

1. Find the target package's existing spec file(s) under `packages/<pkg>/test/`. If the contract already has a spec file, extend it in its existing style. If it doesn't, create a new one in the canonical (newer) style, mirroring the closest sibling package's file layout.
2. Add new cases inside the matching `describe` block by behavior — don't create a second `describe` for a method that already has one.
3. Run the package's tests after writing them: `cd packages/<pkg> && npx hardhat test`. (`pnpm --filter` also works but takes the *package name*, not the directory name — `pnpm --filter @cryptoalgebra/access-list-plugin test` for `packages/access-list`.) Fix failures before reporting done.
4. If the test exists specifically to close a coverage gap that `test-review` (or the coverage table) flagged, re-run `npx hardhat coverage` afterward and confirm that exact line/branch is now covered — a test that merely calls the function isn't the same as one that exercises the previously-missing path (e.g. it might still run the same branch as an existing test).

## Do not

- Do not restyle or reformat existing untouched tests, and do not migrate a file's style while adding unrelated test cases to it — that's a separate, deliberate task.
- Do not add new helpers to `test-utils` speculatively — it's shared across every package. Only add one there if it's genuinely reused 2+ times in the change you're making, and confirm with the user first.
