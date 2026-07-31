import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('OnchainIdAllowlistChecker', function () {
  const REQUIRED_TOPIC = 1n;
  const ALL_ALLOWED = '0xffff';
  const NONE = '0x0000';

  async function deployFixture() {
    const [admin, wallet, other, token] = await ethers.getSigners();

    const MockIdFactory = await ethers.getContractFactory('MockIdFactory');
    const idFactory = await MockIdFactory.deploy();

    const MockIdentity = await ethers.getContractFactory('MockIdentity');
    const identity = await MockIdentity.deploy();

    const MockClaimIssuer = await ethers.getContractFactory('MockClaimIssuer');
    const claimIssuer = await MockClaimIssuer.deploy();

    const OnchainIdAllowlistChecker = await ethers.getContractFactory('OnchainIdAllowlistChecker');
    const checker = await OnchainIdAllowlistChecker.deploy(admin.address, idFactory.target, REQUIRED_TOPIC);

    await idFactory.setIdentity(wallet.address, identity.target);

    return { admin, wallet, other, token, idFactory, identity, claimIssuer, checker };
  }

  async function addValidClaim(identity: any, claimIssuer: any, topic: bigint) {
    await identity.addClaim(topic, 1, claimIssuer.target, '0x', '0x', '');
  }

  it('sets admin, identityFactory and requiredTopic at construction', async function () {
    const { admin, idFactory, checker } = await loadFixture(deployFixture);

    expect(await checker.admin()).to.equal(admin.address);
    expect(await checker.identityFactory()).to.equal(idFactory.target);
    expect(await checker.requiredTopic()).to.equal(REQUIRED_TOPIC);
  });

  it('blocks a wallet with no identity', async function () {
    const { other, token, checker } = await loadFixture(deployFixture);

    expect(await checker.isEligible(other.address)).to.equal(false);
    expect(await checker.checkAllowlist(other.address, token.address)).to.equal(NONE);
  });

  it('blocks a wallet whose identity has no claim for the required topic', async function () {
    const { wallet, token, checker } = await loadFixture(deployFixture);

    expect(await checker.isEligible(wallet.address)).to.equal(false);
    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(NONE);
  });

  it('blocks a wallet whose claim comes from an untrusted issuer', async function () {
    const { wallet, identity, claimIssuer, checker } = await loadFixture(deployFixture);

    await addValidClaim(identity, claimIssuer, REQUIRED_TOPIC);
    // Note: issuer never trusted via setTrustedIssuer

    expect(await checker.isEligible(wallet.address)).to.equal(false);
  });

  it('blocks a wallet whose claim is no longer valid', async function () {
    const { admin, wallet, identity, claimIssuer, checker } = await loadFixture(deployFixture);

    await checker.connect(admin).setTrustedIssuer(claimIssuer.target, true);
    await addValidClaim(identity, claimIssuer, REQUIRED_TOPIC);
    await claimIssuer.setClaimValid(false);

    expect(await checker.isEligible(wallet.address)).to.equal(false);
  });

  it('allows a wallet with a valid claim from a trusted issuer', async function () {
    const { admin, wallet, token, identity, claimIssuer, checker } = await loadFixture(deployFixture);

    await checker.connect(admin).setTrustedIssuer(claimIssuer.target, true);
    await addValidClaim(identity, claimIssuer, REQUIRED_TOPIC);

    expect(await checker.isEligible(wallet.address)).to.equal(true);
    expect(await checker.checkAllowlist(wallet.address, token.address)).to.equal(ALL_ALLOWED);
  });

  it('stops being eligible once the issuer is untrusted', async function () {
    const { admin, wallet, identity, claimIssuer, checker } = await loadFixture(deployFixture);

    await checker.connect(admin).setTrustedIssuer(claimIssuer.target, true);
    await addValidClaim(identity, claimIssuer, REQUIRED_TOPIC);
    expect(await checker.isEligible(wallet.address)).to.equal(true);

    await checker.connect(admin).setTrustedIssuer(claimIssuer.target, false);
    expect(await checker.isEligible(wallet.address)).to.equal(false);
  });

  it('supports batch trusted-issuer updates', async function () {
    const { admin, checker } = await loadFixture(deployFixture);
    const issuers = [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];

    await checker.connect(admin).setTrustedIssuersBatch(issuers, [true, true]);

    expect(await checker.isTrustedIssuer(issuers[0])).to.equal(true);
    expect(await checker.isTrustedIssuer(issuers[1])).to.equal(true);
  });

  it('rejects config changes from a non-admin', async function () {
    const { other, checker } = await loadFixture(deployFixture);

    await expect(checker.connect(other).setRequiredTopic(2n)).to.be.revertedWithCustomError(checker, 'OnlyAdmin');
    await expect(checker.connect(other).setTrustedIssuer(other.address, true)).to.be.revertedWithCustomError(checker, 'OnlyAdmin');
  });

  it('supports ERC-165 and registers cleanly in AllowlistCheckerRegistry', async function () {
    const { token, checker } = await loadFixture(deployFixture);

    expect(await checker.supportsInterface('0x01ffc9a7')).to.equal(true); // ERC165 itself

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();
    const AllowlistCheckerRegistry = await ethers.getContractFactory('AllowlistCheckerRegistry');
    const registry = await AllowlistCheckerRegistry.deploy(mockFactory.target);

    // Deployer of MockFactory is its owner, so setChecker passes the manager check directly
    await expect(registry.setChecker(token.address, checker.target)).to.not.be.reverted;
  });
});
