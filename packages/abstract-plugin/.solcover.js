const fs = require('fs');

const testContracts = fs.readdirSync('./contracts/test');
const skipFiles = testContracts.map((x) => 'test/' + x);

module.exports = {
  skipFiles: skipFiles,
  testfiles: 'test/*.ts',
  configureYulOptimizer: true,
  mocha: {
    grep: '@skip-on-coverage',
    invert: true,
  },
};
