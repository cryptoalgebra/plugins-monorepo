import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('KycRegistry', function () {
  async function deployFixture() {
    const [owner, kycManager, kycPauser, user1, user2, user3, unauthorized] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy KycRegistry
    const KycRegistry = await ethers.getContractFactory('KycRegistry');
    const kycRegistry = await KycRegistry.deploy(mockFactory.target);

    // Grant KYC roles
    const KYC_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('KYC_MANAGER'));
    const KYC_PAUSER = ethers.keccak256(ethers.toUtf8Bytes('KYC_PAUSER'));
    await mockFactory.grantRole(KYC_MANAGER, kycManager.address);
    await mockFactory.grantRole(KYC_PAUSER, kycPauser.address);

    return {
      owner,
      kycManager,
      kycPauser,
      user1,
      user2,
      user3,
      unauthorized,
      mockFactory,
      kycRegistry,
      KYC_MANAGER,
      KYC_PAUSER,
    };
  }

  describe('Deployment', function () {
    it('should deploy with correct factory', async function () {
      const { kycRegistry, mockFactory } = await loadFixture(deployFixture);
      expect(await kycRegistry.algebraFactory()).to.equal(mockFactory.target);
    });

    it('should start unpaused', async function () {
      const { kycRegistry } = await loadFixture(deployFixture);
      expect(await kycRegistry.isPaused()).to.be.false;
    });

    it('should start with no whitelisted users', async function () {
      const { kycRegistry, user1 } = await loadFixture(deployFixture);
      expect(await kycRegistry.isWhitelisted(user1.address)).to.be.false;
    });
  });

  describe('Whitelist management', function () {
    it('should allow KYC manager to whitelist a user', async function () {
      const { kycRegistry, kycManager, user1 } = await loadFixture(deployFixture);

      await expect(kycRegistry.connect(kycManager).setWhitelisted(user1.address, true))
        .to.emit(kycRegistry, 'UserWhitelistUpdated')
        .withArgs(user1.address, true);

      expect(await kycRegistry.isWhitelisted(user1.address)).to.be.true;
    });

    it('should allow KYC manager to remove a user from whitelist', async function () {
      const { kycRegistry, kycManager, user1 } = await loadFixture(deployFixture);

      await kycRegistry.connect(kycManager).setWhitelisted(user1.address, true);
      await expect(kycRegistry.connect(kycManager).setWhitelisted(user1.address, false))
        .to.emit(kycRegistry, 'UserWhitelistUpdated')
        .withArgs(user1.address, false);

      expect(await kycRegistry.isWhitelisted(user1.address)).to.be.false;
    });

    it('should allow owner to whitelist a user', async function () {
      const { kycRegistry, owner, user1 } = await loadFixture(deployFixture);

      await expect(kycRegistry.connect(owner).setWhitelisted(user1.address, true))
        .to.emit(kycRegistry, 'UserWhitelistUpdated')
        .withArgs(user1.address, true);
    });

    it('should not allow unauthorized user to whitelist', async function () {
      const { kycRegistry, unauthorized, user1 } = await loadFixture(deployFixture);

      await expect(
        kycRegistry.connect(unauthorized).setWhitelisted(user1.address, true)
      ).to.be.revertedWith('Only KYC manager');
    });

    it('should handle batch whitelist', async function () {
      const { kycRegistry, kycManager, user1, user2, user3 } = await loadFixture(deployFixture);

      const users = [user1.address, user2.address, user3.address];
      const statuses = [true, true, true];

      await kycRegistry.connect(kycManager).setWhitelistedBatch(users, statuses);

      expect(await kycRegistry.isWhitelisted(user1.address)).to.be.true;
      expect(await kycRegistry.isWhitelisted(user2.address)).to.be.true;
      expect(await kycRegistry.isWhitelisted(user3.address)).to.be.true;
    });

    it('should handle batch with mixed statuses', async function () {
      const { kycRegistry, kycManager, user1, user2 } = await loadFixture(deployFixture);

      // Whitelist both first
      await kycRegistry.connect(kycManager).setWhitelistedBatch(
        [user1.address, user2.address],
        [true, true]
      );

      // Remove user1 but keep user2
      await kycRegistry.connect(kycManager).setWhitelistedBatch(
        [user1.address, user2.address],
        [false, true]
      );

      expect(await kycRegistry.isWhitelisted(user1.address)).to.be.false;
      expect(await kycRegistry.isWhitelisted(user2.address)).to.be.true;
    });

    it('should revert batch whitelist with length mismatch', async function () {
      const { kycRegistry, kycManager, user1, user2 } = await loadFixture(deployFixture);

      await expect(
        kycRegistry.connect(kycManager).setWhitelistedBatch(
          [user1.address, user2.address],
          [true]
        )
      ).to.be.revertedWith('Length mismatch');
    });

    it('should not allow unauthorized user to batch whitelist', async function () {
      const { kycRegistry, unauthorized, user1 } = await loadFixture(deployFixture);

      await expect(
        kycRegistry.connect(unauthorized).setWhitelistedBatch([user1.address], [true])
      ).to.be.revertedWith('Only KYC manager');
    });
  });

  describe('Pause / Unpause', function () {
    it('should allow KYC pauser to pause', async function () {
      const { kycRegistry, kycPauser } = await loadFixture(deployFixture);

      await expect(kycRegistry.connect(kycPauser).pause())
        .to.emit(kycRegistry, 'KycPaused');

      expect(await kycRegistry.isPaused()).to.be.true;
    });

    it('should allow KYC manager to pause', async function () {
      const { kycRegistry, kycManager } = await loadFixture(deployFixture);

      await expect(kycRegistry.connect(kycManager).pause())
        .to.emit(kycRegistry, 'KycPaused');

      expect(await kycRegistry.isPaused()).to.be.true;
    });

    it('should allow owner to pause', async function () {
      const { kycRegistry, owner } = await loadFixture(deployFixture);

      await expect(kycRegistry.connect(owner).pause())
        .to.emit(kycRegistry, 'KycPaused');
    });

    it('should not allow unauthorized user to pause', async function () {
      const { kycRegistry, unauthorized } = await loadFixture(deployFixture);

      await expect(
        kycRegistry.connect(unauthorized).pause()
      ).to.be.revertedWith('Only KYC pauser');
    });

    it('should allow KYC manager to unpause', async function () {
      const { kycRegistry, kycManager, kycPauser } = await loadFixture(deployFixture);

      await kycRegistry.connect(kycPauser).pause();

      await expect(kycRegistry.connect(kycManager).unpause())
        .to.emit(kycRegistry, 'KycUnpaused');

      expect(await kycRegistry.isPaused()).to.be.false;
    });

    it('should not allow KYC pauser to unpause', async function () {
      const { kycRegistry, kycPauser } = await loadFixture(deployFixture);

      await kycRegistry.connect(kycPauser).pause();

      await expect(
        kycRegistry.connect(kycPauser).unpause()
      ).to.be.revertedWith('Only KYC manager');
    });

    it('should not allow unauthorized user to unpause', async function () {
      const { kycRegistry, unauthorized, kycPauser } = await loadFixture(deployFixture);

      await kycRegistry.connect(kycPauser).pause();

      await expect(
        kycRegistry.connect(unauthorized).unpause()
      ).to.be.revertedWith('Only KYC manager');
    });
  });
});
