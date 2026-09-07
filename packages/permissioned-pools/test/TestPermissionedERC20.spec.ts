import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('TestPermissionedERC20', function () {
  const KYC = ethers.keccak256(ethers.toUtf8Bytes('common.kyc'));
  const ACCREDITED = ethers.keccak256(ethers.toUtf8Bytes('common.accredited'));

  const ccidOf = (n: number) => '0x' + n.toString(16).padStart(2, '0').repeat(32);

  async function deployFixture() {
    const [owner, alice, bob, outsider, pool] = await ethers.getSigners();

    const identityRegistry = await (await ethers.getContractFactory('MockAceIdentityRegistry')).deploy();
    const credentialRegistry = await (await ethers.getContractFactory('MockAceCredentialRegistry')).deploy();

    const token = await (
      await ethers.getContractFactory('TestPermissionedERC20')
    ).deploy('Permissioned Test Token', 'PTT', identityRegistry.target, credentialRegistry.target, KYC);

    // Alice passes KYC, Bob does not
    await identityRegistry.setIdentity(alice.address, ccidOf(1));
    await credentialRegistry.setCredential(ccidOf(1), KYC, true);

    return { owner, alice, bob, outsider, pool, identityRegistry, credentialRegistry, token };
  }

  it('exempts the deployer so the token can be funded before anyone is onboarded', async function () {
    const { owner, token } = await loadFixture(deployFixture);

    expect(await token.isExempt(owner.address)).to.equal(true);
    await expect(token.mint(owner.address, 1000n)).to.not.be.reverted;
    expect(await token.balanceOf(owner.address)).to.equal(1000n);
  });

  it('reports eligibility through isAllowed', async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);

    expect(await token.isAllowed(alice.address)).to.equal(true);
    expect(await token.isAllowed(bob.address)).to.equal(false);
  });

  it('denies an account that has a CCID but not the required credential', async function () {
    const { bob, identityRegistry, token } = await loadFixture(deployFixture);

    // Registered on this chain, but holding no credential of the required type
    await identityRegistry.setIdentity(bob.address, ccidOf(2));

    expect(await token.isAllowed(bob.address)).to.equal(false);
  });

  it('mints to a credentialled account but not to an unknown one', async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);

    await expect(token.mint(alice.address, 100n)).to.not.be.reverted;
    await expect(token.mint(bob.address, 100n))
      .to.be.revertedWithCustomError(token, 'TransferNotAllowed')
      .withArgs(bob.address);
  });

  it('allows a transfer between two credentialled accounts', async function () {
    const { alice, bob, identityRegistry, credentialRegistry, token } = await loadFixture(deployFixture);

    await identityRegistry.setIdentity(bob.address, ccidOf(2));
    await credentialRegistry.setCredential(ccidOf(2), KYC, true);
    await token.mint(alice.address, 100n);

    await expect(token.connect(alice).transfer(bob.address, 40n)).to.not.be.reverted;
    expect(await token.balanceOf(bob.address)).to.equal(40n);
  });

  it('blocks a transfer to an account without credentials', async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);

    await expect(token.connect(alice).transfer(bob.address, 40n))
      .to.be.revertedWithCustomError(token, 'TransferNotAllowed')
      .withArgs(bob.address);
  });

  it('blocks a transfer from an account whose credential was revoked', async function () {
    const { owner, alice, credentialRegistry, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);
    await credentialRegistry.setCredential(ccidOf(1), KYC, false);

    await expect(token.connect(alice).transfer(owner.address, 10n))
      .to.be.revertedWithCustomError(token, 'TransferNotAllowed')
      .withArgs(alice.address);
  });

  it('blocks trading against a pool that is neither exempt nor credentialled', async function () {
    const { alice, pool, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);

    // This is the failure every permissioned token hits on its first swap: the pool itself
    // has to be allowed to hold the asset
    await expect(token.connect(alice).transfer(pool.address, 50n))
      .to.be.revertedWithCustomError(token, 'TransferNotAllowed')
      .withArgs(pool.address);
  });

  it('allows trading once the pool is exempt', async function () {
    const { alice, pool, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);
    await token.setExempt(pool.address, true);

    await expect(token.connect(alice).transfer(pool.address, 50n)).to.not.be.reverted;
    // and back out of the pool again
    await expect(token.connect(pool).transfer(alice.address, 20n)).to.not.be.reverted;
    expect(await token.balanceOf(alice.address)).to.equal(70n);
  });

  it('exempts several addresses at once', async function () {
    const { pool, outsider, token } = await loadFixture(deployFixture);

    await token.setExemptBatch([pool.address, outsider.address], true);

    expect(await token.isExempt(pool.address)).to.equal(true);
    expect(await token.isExempt(outsider.address)).to.equal(true);
  });

  it('switches the required credential type', async function () {
    const { owner, alice, token, credentialRegistry } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);
    await token.setRequiredCredentialTypeId(ACCREDITED);

    // Alice only holds kyc, which no longer suffices
    expect(await token.isAllowed(alice.address)).to.equal(false);
    await expect(token.connect(alice).transfer(owner.address, 10n)).to.be.revertedWithCustomError(
      token,
      'TransferNotAllowed'
    );

    await credentialRegistry.setCredential(ccidOf(1), ACCREDITED, true);
    expect(await token.isAllowed(alice.address)).to.equal(true);
  });

  it('lifts every restriction when the registries are unset', async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);
    await token.setRegistries(ethers.ZeroAddress, ethers.ZeroAddress);

    expect(await token.isAllowed(bob.address)).to.equal(true);
    await expect(token.connect(alice).transfer(bob.address, 10n)).to.not.be.reverted;
  });

  it('points at a different pair of registries', async function () {
    const { alice, bob, token } = await loadFixture(deployFixture);

    const identityRegistry = await (await ethers.getContractFactory('MockAceIdentityRegistry')).deploy();
    const credentialRegistry = await (await ethers.getContractFactory('MockAceCredentialRegistry')).deploy();
    await identityRegistry.setIdentity(bob.address, ccidOf(3));
    await credentialRegistry.setCredential(ccidOf(3), KYC, true);

    await token.setRegistries(identityRegistry.target, credentialRegistry.target);

    // Bob is credentialled in the new registries, Alice only in the old ones
    expect(await token.isAllowed(bob.address)).to.equal(true);
    expect(await token.isAllowed(alice.address)).to.equal(false);
  });

  it('surfaces a broken registry loudly instead of reporting a missing credential', async function () {
    const { alice, bob, identityRegistry, credentialRegistry, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);

    // A misconfigured registry must not be indistinguishable from "this account has no credential"
    await identityRegistry.setShouldRevert(true);
    await expect(token.isAllowed(bob.address)).to.be.revertedWith('MockAceIdentityRegistry: forced revert');
    await expect(token.connect(alice).transfer(bob.address, 10n)).to.be.revertedWith(
      'MockAceIdentityRegistry: forced revert'
    );

    await identityRegistry.setShouldRevert(false);
    await credentialRegistry.setShouldRevert(true);
    await expect(token.isAllowed(alice.address)).to.be.revertedWith('MockAceCredentialRegistry: forced revert');
  });

  it('lets a credentialled holder burn', async function () {
    const { alice, token } = await loadFixture(deployFixture);

    await token.mint(alice.address, 100n);

    await expect(token.connect(alice).burn(40n)).to.not.be.reverted;
    expect(await token.totalSupply()).to.equal(60n);
  });

  it('restricts configuration to the owner', async function () {
    const { bob, token } = await loadFixture(deployFixture);

    await expect(token.connect(bob).setRegistries(ethers.ZeroAddress, ethers.ZeroAddress)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
    await expect(token.connect(bob).setRequiredCredentialTypeId(KYC)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
    await expect(token.connect(bob).setExempt(bob.address, true)).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(token.connect(bob).mint(bob.address, 1n)).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
