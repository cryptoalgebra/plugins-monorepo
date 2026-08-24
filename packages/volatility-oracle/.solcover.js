const fs = require('fs');

const testContracts = fs.readdirSync('./contracts/test');
const skipFiles = testContracts.map((x) => 'test/' + x);

module.exports = {
  skipFiles: skipFiles,
  testfiles: 'test/*.ts',
  configureYulOptimizer: true,
  mocha: {
    // Gas numbers are meaningless under instrumentation. @slow is excluded as well: this config
    // replaces the mocha section of hardhat.config.ts, which is what keeps that suite out of a
    // normal run, and a 65536 timepoint fill through instrumented code is far slower again.
    grep: '@skip-on-coverage|@slow',
    invert: true,
  },
};
