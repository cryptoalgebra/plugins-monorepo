import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('AceAllowlistChecker', function () {
  const NONE = '0x0000';
  const SWAP_ALLOWED = '0x0001';
  const LIQUIDITY_ALLOWED = '0x0002';
  const SWAP_AND_LIQUIDITY = '0x0003';

  const KIND_CREDENTIAL = 0;
  const KIND_VALIDATOR = 1;

  const KYC = ethers.keccak256(ethers.toUtf8Bytes('common.kyc'));
  const ACCREDITED = ethers.keccak256(ethers.toUtf8Bytes('common.accredited'));
  const CCID = '0x' + '11'.repeat(32);

  const credentialRule = (credentialTypeId: string, flags: string) => ({
    validator: ethers.ZeroAddress,
    flags,
    kind: KIND_CREDENTIAL,
    credentialTypeId,
  });

  const validatorRule = (validator: string, flags: string) => ({
    validator,
    flags,
    kind: KIND_VALIDATOR,
    credentialTypeId: ethers.ZeroHash,
  });

  async function deployFixture() {
    const [admin, wallet, other, token, otherToken] = await ethers.getSigners();

    const identityRegistry = await (await ethers.getContractFactory('MockAceIdentityRegistry')).deploy();
    const credentialRegistry = await (await ethers.getContractFactory('MockAceCredentialRegistry')).deploy();
    const validator = await (await ethers.getContractFactory('MockAceIdentityValidator')).deploy();

    // Mirrors the Base Sepolia setup: kyc grants swaps, accredited also grants liquidity
    const rules = [credentialRule(ACCREDITED, SWAP_AND_LIQUIDITY), credentialRule(KYC, SWAP_ALLOWED)];

    const checker = await (
      await ethers.getContractFactory('AceAllowlistChecker')
    ).deploy(admin.address, identityRegistry.target, credentialRegistry.target, rules);

    await identityRegistry.setIdentity(wallet.address, CCID);

    return { admin, wallet, other, token, otherToken, identityRegistry, credentialRegistry, validator, checker };
  }

  it('stores admin, registries and rules at construction', async function () {
    const { admin, identityRegistry, credentialRegistry, checker } = await loadFixture(deployFixture);

    expect(await checker.admin()).to.equal(admin.address);
    expect(await checker.identityRegistry()).to.equal(identityRegistry.target);
    expect(await checker.credentialRegistry()).to.equal(credentialRegistry.target);
    expect(await checker.getDefaultRules()).to.have.lengthOf(2);
  });

  it('denies a wallet with no CCID on this chain', async function () {
    const { other, token, checker } = await loadFixture(deployFixture);

    expect(await checker.checkAllowlist(other.address, token.address)).to.equal(NONE);
  });

  it('denies a wallet that has a CCID but no credential', async function () {
    const { wallet, token, checker } = await loadFixture(deployFixture);

    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
  });

  it('grants swap-only permissions for a kyc credential', async function () {
    const { wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

    await credentialRegistry.setCredential(CCID, KYC, true);

    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_ALLOWED);
  });

  it('grants swap and liquidity permissions for an accredited credential', async function () {
    const { wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

    await credentialRegistry.setCredential(CCID, ACCREDITED, true);

    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_AND_LIQUIDITY);
  });

  it('unions the flags of every satisfied rule', async function () {
    const { admin, wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

    // Two rules that each grant a different single flag
    await checker
      .connect(admin)
      .setDefaultRules([credentialRule(KYC, SWAP_ALLOWED), credentialRule(ACCREDITED, LIQUIDITY_ALLOWED)]);
    await credentialRegistry.setCredential(CCID, KYC, true);
    await credentialRegistry.setCredential(CCID, ACCREDITED, true);

    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_AND_LIQUIDITY);
  });

  it('loses permissions once the credential stops validating', async function () {
    const { wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

    await credentialRegistry.setCredential(CCID, KYC, true);
    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_ALLOWED);

    await credentialRegistry.setCredential(CCID, KYC, false);
    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
  });

  it('satisfies a rule through an ACE identity validator', async function () {
    const { admin, wallet, token, validator, checker } = await loadFixture(deployFixture);

    await checker.connect(admin).setDefaultRules([validatorRule(validator.target as string, SWAP_AND_LIQUIDITY)]);
    await validator.setValid(wallet.address, true);

    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_AND_LIQUIDITY);
  });

  it('resolves a validator rule for a wallet with no CCID of its own', async function () {
    const { admin, other, token, validator, checker } = await loadFixture(deployFixture);

    // The validator does its own resolution, so the checker must not require a local CCID first
    await checker.connect(admin).setDefaultRules([validatorRule(validator.target as string, SWAP_ALLOWED)]);
    await validator.setValid(other.address, true);

    expect(await checker.checkAllowlist(other.address, token.address)).to.equal(SWAP_ALLOWED);
  });

  it('mixes credential and validator rules in one configuration', async function () {
    const { admin, wallet, token, credentialRegistry, validator, checker } = await loadFixture(deployFixture);

    await checker
      .connect(admin)
      .setDefaultRules([credentialRule(KYC, SWAP_ALLOWED), validatorRule(validator.target as string, LIQUIDITY_ALLOWED)]);
    await credentialRegistry.setCredential(CCID, KYC, true);
    await validator.setValid(wallet.address, true);

    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_AND_LIQUIDITY);
  });

  describe('per-token rules', function () {
    it('applies a token override instead of the defaults', async function () {
      const { admin, wallet, token, otherToken, credentialRegistry, checker } = await loadFixture(deployFixture);

      // This token demands accreditation even for swaps
      await checker.connect(admin).setTokenRules(token.address, [credentialRule(ACCREDITED, SWAP_ALLOWED)]);
      await credentialRegistry.setCredential(CCID, KYC, true);

      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
      // Any other token still follows the defaults, where kyc is enough
      expect(await checker.checkAllowlist(wallet.address, otherToken.address)).to.equal(SWAP_ALLOWED);
    });

    it('falls back to the defaults once an override is cleared', async function () {
      const { admin, wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

      await checker.connect(admin).setTokenRules(token.address, [credentialRule(ACCREDITED, SWAP_ALLOWED)]);
      await checker.connect(admin).setTokenRules(token.address, []);
      await credentialRegistry.setCredential(CCID, KYC, true);

      expect(await checker.getTokenRules(token.address)).to.have.lengthOf(0);
      expect(await checker.getEffectiveRules(token.address)).to.have.lengthOf(2);
      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_ALLOWED);
    });

    it('denies everything when no rules are configured at all', async function () {
      const { admin, wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

      await checker.connect(admin).setDefaultRules([]);
      await credentialRegistry.setCredential(CCID, KYC, true);

      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
    });
  });

  describe('defensive behaviour', function () {
    it('returns no permissions instead of reverting when the identity registry fails', async function () {
      const { wallet, token, identityRegistry, credentialRegistry, checker } = await loadFixture(deployFixture);

      await credentialRegistry.setCredential(CCID, KYC, true);
      await identityRegistry.setShouldRevert(true);

      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
    });

    it('returns no permissions instead of reverting when the credential registry fails', async function () {
      const { wallet, token, credentialRegistry, checker } = await loadFixture(deployFixture);

      await credentialRegistry.setCredential(CCID, KYC, true);
      await credentialRegistry.setShouldRevert(true);

      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
    });

    it('ignores only the failing rule when a validator reverts', async function () {
      const { admin, wallet, token, credentialRegistry, validator, checker } = await loadFixture(deployFixture);

      await checker
        .connect(admin)
        .setDefaultRules([
          validatorRule(validator.target as string, LIQUIDITY_ALLOWED),
          credentialRule(KYC, SWAP_ALLOWED),
        ]);
      await credentialRegistry.setCredential(CCID, KYC, true);
      await validator.setValid(wallet.address, true);
      await validator.setShouldRevert(true);

      // The credential rule still contributes its flag
      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_ALLOWED);
    });
  });

  describe('configuration', function () {
    it('lets the admin repoint the registries', async function () {
      const { admin, wallet, token, checker } = await loadFixture(deployFixture);

      const newIdentityRegistry = await (await ethers.getContractFactory('MockAceIdentityRegistry')).deploy();
      const newCredentialRegistry = await (await ethers.getContractFactory('MockAceCredentialRegistry')).deploy();

      await checker.connect(admin).setRegistries(newIdentityRegistry.target, newCredentialRegistry.target);
      await newIdentityRegistry.setIdentity(wallet.address, CCID);
      await newCredentialRegistry.setCredential(CCID, KYC, true);

      expect(await checker.identityRegistry()).to.equal(newIdentityRegistry.target);
      expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(SWAP_ALLOWED);
    });

    it('rejects configuration changes from a non-admin', async function () {
      const { other, token, checker } = await loadFixture(deployFixture);

      await expect(checker.connect(other).setDefaultRules([])).to.be.revertedWithCustomError(checker, 'OnlyAdmin');
      await expect(checker.connect(other).setTokenRules(token.address, [])).to.be.revertedWithCustomError(
        checker,
        'OnlyAdmin'
      );
      await expect(
        checker.connect(other).setRegistries(other.address, other.address)
      ).to.be.revertedWithCustomError(checker, 'OnlyAdmin');
    });

    it('rejects rules that could never grant anything', async function () {
      const { admin, checker } = await loadFixture(deployFixture);

      // No flags at all
      await expect(
        checker.connect(admin).setDefaultRules([credentialRule(KYC, NONE)])
      ).to.be.revertedWithCustomError(checker, 'InvalidRule');

      // Credential rule with no credential type
      await expect(
        checker.connect(admin).setDefaultRules([credentialRule(ethers.ZeroHash, SWAP_ALLOWED)])
      ).to.be.revertedWithCustomError(checker, 'InvalidRule');

      // Validator rule with no validator
      await expect(
        checker.connect(admin).setDefaultRules([validatorRule(ethers.ZeroAddress, SWAP_ALLOWED)])
      ).to.be.revertedWithCustomError(checker, 'InvalidRule');
    });

    it('rejects a zero registry address', async function () {
      const { admin, identityRegistry, checker } = await loadFixture(deployFixture);

      await expect(
        checker.connect(admin).setRegistries(ethers.ZeroAddress, identityRegistry.target)
      ).to.be.revertedWithCustomError(checker, 'ZeroAddress');
    });
  });

  it('supports ERC-165 and registers cleanly in AllowlistCheckerRegistry', async function () {
    const { token, checker } = await loadFixture(deployFixture);

    expect(await checker.supportsInterface('0x01ffc9a7')).to.equal(true); // ERC165 itself

    const mockFactory = await (await ethers.getContractFactory('MockFactory')).deploy();
    const registry = await (await ethers.getContractFactory('AllowlistCheckerRegistry')).deploy(mockFactory.target);

    await expect(registry.setChecker(token.address, checker.target)).to.not.be.reverted;
    expect(await registry.getChecker(token.address)).to.equal(checker.target);
  });
});
