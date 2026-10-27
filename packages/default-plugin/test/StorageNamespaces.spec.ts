import { expect } from 'chai';
import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

// Modules share the plugin's storage and are kept apart only by their ERC-7201 namespace.
// Each slot is a hardcoded constant, so a mistyped one would move a module's state silently.
describe('ERC-7201 storage namespaces', function () {
  const packagesDir = path.resolve(__dirname, '../..');

  // The namespaces AlgebraUpgradeablePlugin composes into one storage
  const COMPOSED = [
    'abstract-plugin/contracts/libraries/AbstractPluginStorage.sol',
    'alm/contracts/libraries/AlmStorage.sol',
    'dynamic-fee/contracts/libraries/DynamicFeeStorage.sol',
    'farming-proxy/contracts/libraries/FarmingProxyStorage.sol',
    'safety-switch/contracts/libraries/SecurityStorage.sol',
    'volatility-oracle/contracts/libraries/VolatilityOracleStorage.sol',
  ];

  function storageLibraries(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'test') walk(full);
        } else if (entry.name.endsWith('Storage.sol')) {
          found.push(path.relative(packagesDir, full).split(path.sep).join('/'));
        }
      }
    };
    for (const pkg of fs.readdirSync(packagesDir)) {
      // packages/ also holds build leftovers from other branches, and those have no hardhat config
      if (!fs.existsSync(path.join(packagesDir, pkg, 'hardhat.config.ts'))) continue;
      const contracts = path.join(packagesDir, pkg, 'contracts');
      if (fs.existsSync(contracts)) walk(contracts);
    }
    return found.sort();
  }

  function erc7201(namespace: string): string {
    const inner = BigInt(ethers.keccak256(ethers.toUtf8Bytes(namespace))) - 1n;
    const outer = BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [inner]))) & ~0xffn;
    return ethers.toBeHex(outer, 32);
  }

  // The namespace string exists only in the comment above the constant, so both come from source
  function declared(file: string): { namespace: string; slot: string } {
    const source = fs.readFileSync(path.join(packagesDir, file), 'utf8');
    const namespaces = [...source.matchAll(/keccak256\("(erc7201:[^"]+)"\)/g)].map((match) => match[1]);
    const slots = [...source.matchAll(/bytes32 internal constant \w+ = (0x[0-9a-fA-F]{64});/g)].map((match) => match[1].toLowerCase());
    expect(namespaces, `${file} should name exactly one namespace`).to.have.lengthOf(1);
    expect(slots, `${file} should declare exactly one slot`).to.have.lengthOf(1);
    return { namespace: namespaces[0], slot: slots[0] };
  }

  const libraries = storageLibraries();

  it('should find every namespace the shipped plugin composes', function () {
    expect(libraries).to.include.members(COMPOSED);
  });

  for (const file of libraries) {
    it(`should derive the slot in ${file} from its namespace`, function () {
      const { namespace, slot } = declared(file);
      expect(slot).to.equal(erc7201(namespace));
    });
  }

  it('should give every module a slot of its own', function () {
    const slots = libraries.map((file) => declared(file).slot);
    expect(new Set(slots).size).to.equal(slots.length);
  });
});
