#!/usr/bin/env node
// Applies one textual mutation to a contract, runs the given specs, restores the file and
// verifies the file is byte-identical again. A test suite that stays green under a mutation
// is not guarding the line that changed.
//
//   node packages/test-utils/scripts/mutate.js <pkg> <contract> <find> <replace> [spec...]
//   RUN_PKG=<other-pkg> node ... mutate.js ...   judge the mutation by another package's suite
//   An empty <replace> deletes the anchor. Exit 0: killed, 1: survived, 2-4: bad arguments,
//   5: no verdict, 6: restore failed.
//
// Two habits this encodes. It refuses an ambiguous anchor, because replacing the first of
// several occurrences mutates something other than what you meant. And a mutation that survives
// only accuses the tests once you know the behaviour actually changed: an equivalent mutant and
// a stale build both look like a passing suite, so pair every survivor with a control mutation
// the suite must notice.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const [pkg, rel, find, replace, ...specs] = process.argv.slice(2);
if (!pkg || !rel || !find || replace === undefined) {
  console.error('usage: mutate.js <pkg> <contract> <find> <replace> [spec...]');
  process.exit(2);
}

const abs = path.join(ROOT, 'packages', pkg, rel);
const originalBytes = fs.readFileSync(abs);
const original = originalBytes.toString('utf8');

if (!original.includes(find)) {
  console.error(`find string not present in ${rel}\n  looked for: ${find}`);
  process.exit(3);
}
const occurrences = original.split(find).length - 1;
if (occurrences > 1) {
  console.error(`ambiguous: "${find}" occurs ${occurrences} times — refusing`);
  process.exit(4);
}

try {
  // A function replacer, so `$&` and friends in the mutation are taken literally
  fs.writeFileSync(abs, original.replace(find, () => replace));
  console.log(`mutation applied to ${rel}`);

  const runPkg = process.env.RUN_PKG || pkg;
  // One command string: an argument array alongside shell: true is deprecated (DEP0190)
  const run = spawnSync(['npx hardhat test', ...specs.map((s) => `"${s}"`)].join(' '), {
    cwd: path.join(ROOT, 'packages', runPkg),
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = (run.stdout || '') + (run.stderr || '');
  const passing = /(\d+) passing/.exec(out);
  const failing = /(\d+) failing/.exec(out);

  if (/Error HH\d+|CompilerError|Compilation failed/.test(out)) {
    console.log('result: did not compile');
    process.exitCode = 5;
  } else if (!passing && !failing) {
    console.log('result: nothing ran — check the spec paths');
    process.exitCode = 5;
  } else {
    process.exitCode = failing ? 0 : 1;
    console.log(`result: ${passing ? passing[1] : 0} passing, ${failing ? failing[1] : 0} failing`);
    out
      .split('\n')
      .filter((l) => /^\s+\d+\) /.test(l))
      .slice(0, 12)
      .forEach((l) => console.log('   ' + l.trim().slice(0, 130)));
  }
} finally {
  // Compared with the bytes read at start, not with git: the file may carry uncommitted edits
  fs.writeFileSync(abs, originalBytes);
  if (fs.readFileSync(abs).equals(originalBytes)) {
    console.log('restored: byte-identical to before the mutation');
  } else {
    console.log(`RESTORE FAILED: ${rel} differs from its pre-mutation bytes`);
    process.exitCode = 6;
  }
}
