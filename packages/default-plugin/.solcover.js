module.exports = {
  // contracts/test holds mocks and harnesses, they are not coverage targets
  skipFiles: ['test'],
  configureYulOptimizer: true,
  mocha: {
    // Gas numbers are meaningless under instrumentation, and the coverage network has no fork,
    // so the Base integration suite has nothing to talk to. Both carry the tag.
    grep: '@skip-on-coverage',
    invert: true,
  },
};
