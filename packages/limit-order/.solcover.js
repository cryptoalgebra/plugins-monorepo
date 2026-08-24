const fs = require('fs');

const testContracts = fs.readdirSync('./contracts/test');
const skipFiles = testContracts.map((x) => 'test/' + x);

module.exports = {
  skipFiles: skipFiles,
  testfiles: 'test/*.ts',
  configureYulOptimizer: true,
  mocha: {
    // Gas numbers are meaningless under instrumentation, the tagged cases carry no other assertion
    grep: '@skip-on-coverage',
    invert: true,
  },
};
