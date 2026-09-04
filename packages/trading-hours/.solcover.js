const fs = require('fs');

const testContracts = fs.readdirSync('./contracts/test');
const skipFiles = testContracts.map((x) => 'test/' + x);

module.exports = {
  skipFiles: skipFiles,
  testfiles: 'test/*.ts',
  configureYulOptimizer: true,
  mocha: {
    // The pinned-bytecode guard compares against a fresh artifact, which a coverage build compiles
    // without the optimizer and so differs by design
    grep: '@skip-on-coverage',
    invert: true,
  },
};
