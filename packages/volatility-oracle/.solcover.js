const fs = require('fs');

const testContracts = fs.readdirSync('./contracts/test');
const skipFiles = testContracts.map((x) => 'test/' + x);

module.exports = {
  skipFiles: skipFiles,
  testfiles: 'test/*.ts',
  configureYulOptimizer: true,
  mocha: {
    // Gas numbers are meaningless under instrumentation. @slow is excluded as well, and this is now
    // the only thing the tag does: a normal run includes that suite. Filling 65536 timepoints through
    // instrumented code took the package from 339s to 662s and bought exactly one branch.
    grep: '@skip-on-coverage|@slow',
    invert: true,
  },
};
