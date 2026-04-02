import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('AccessListRegistry', function () {
  async function deployFixture() {
    const [owner, accessListManager, user1, user2, user3, unauthorized] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy AccessListRegistry
    const AccessListRegistry = await ethers.getContractFactory('AccessListRegistry');
    const accessListRegistry = await AccessListRegistry.deploy(mockFactory.target);

    // Grant Access List roles
    const ACCESS_LIST_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ACCESS_LIST_MANAGER'));
    await mockFactory.grantRole(ACCESS_LIST_MANAGER, accessListManager.address);

    return {
      owner,
      accessListManager,
      user1,
      user2,
      user3,
      unauthorized,
      mockFactory,
      accessListRegistry,
      ACCESS_LIST_MANAGER,
    };
  }

  describe('Deployment', function () {
    it('should deploy with correct factory', async function () {
      const { accessListRegistry, mockFactory } = await loadFixture(deployFixture);
      expect(await accessListRegistry.algebraFactory()).to.equal(mockFactory.target);
    });

    it('should start unpaused', async function () {
      const { accessListRegistry } = await loadFixture(deployFixture);
      expect(await accessListRegistry.isPaused()).to.be.false;
    });

    it('should start with no whitelisted users', async function () {
      const { accessListRegistry, user1 } = await loadFixture(deployFixture);
      expect(await accessListRegistry.isWhitelisted(user1.address)).to.be.false;
    });
  });

  describe('Whitelist management', function () {
    it('should allow Access List manager to whitelist a user', async function () {
      const { accessListRegistry, accessListManager, user1 } = await loadFixture(deployFixture);

      await expect(accessListRegistry.connect(accessListManager).setWhitelisted(user1.address, true))
        .to.emit(accessListRegistry, 'UserWhitelistUpdated')
        .withArgs(user1.address, true);

      expect(await accessListRegistry.isWhitelisted(user1.address)).to.be.true;
    });

    it('should allow Access List manager to remove a user from whitelist', async function () {
      const { accessListRegistry, accessListManager, user1 } = await loadFixture(deployFixture);

      await accessListRegistry.connect(accessListManager).setWhitelisted(user1.address, true);
      await expect(accessListRegistry.connect(accessListManager).setWhitelisted(user1.address, false))
        .to.emit(accessListRegistry, 'UserWhitelistUpdated')
        .withArgs(user1.address, false);

      expect(await accessListRegistry.isWhitelisted(user1.address)).to.be.false;
    });

    it('should allow owner to whitelist a user', async function () {
      const { accessListRegistry, owner, user1 } = await loadFixture(deployFixture);

      await expect(accessListRegistry.connect(owner).setWhitelisted(user1.address, true))
        .to.emit(accessListRegistry, 'UserWhitelistUpdated')
        .withArgs(user1.address, true);
    });

    it('should not allow unauthorized user to whitelist', async function () {
      const { accessListRegistry, unauthorized, user1 } = await loadFixture(deployFixture);

      await expect(
        accessListRegistry.connect(unauthorized).setWhitelisted(user1.address, true)
      ).to.be.revertedWith('Only Access List manager');
    });

    it('should handle batch whitelist', async function () {
      const { accessListRegistry, accessListManager, user1, user2, user3 } = await loadFixture(deployFixture);

      const users = [user1.address, user2.address, user3.address];
      const statuses = [true, true, true];

      await accessListRegistry.connect(accessListManager).setWhitelistedBatch(users, statuses);

      expect(await accessListRegistry.isWhitelisted(user1.address)).to.be.true;
      expect(await accessListRegistry.isWhitelisted(user2.address)).to.be.true;
      expect(await accessListRegistry.isWhitelisted(user3.address)).to.be.true;
    });

    it('should handle batch with mixed statuses', async function () {
      const { accessListRegistry, accessListManager, user1, user2 } = await loadFixture(deployFixture);

      // Whitelist both first
      await accessListRegistry.connect(accessListManager).setWhitelistedBatch(
        [user1.address, user2.address],
        [true, true]
      );

      // Remove user1 but keep user2
      await accessListRegistry.connect(accessListManager).setWhitelistedBatch(
        [user1.address, user2.address],
        [false, true]
      );

      expect(await accessListRegistry.isWhitelisted(user1.address)).to.be.false;
      expect(await accessListRegistry.isWhitelisted(user2.address)).to.be.true;
    });

    it('should revert batch whitelist with length mismatch', async function () {
      const { accessListRegistry, accessListManager, user1, user2 } = await loadFixture(deployFixture);

      await expect(
        accessListRegistry.connect(accessListManager).setWhitelistedBatch(
          [user1.address, user2.address],
          [true]
        )
      ).to.be.revertedWith('Length mismatch');
    });

    it('should not allow unauthorized user to batch whitelist', async function () {
      const { accessListRegistry, unauthorized, user1 } = await loadFixture(deployFixture);

      await expect(
        accessListRegistry.connect(unauthorized).setWhitelistedBatch([user1.address], [true])
      ).to.be.revertedWith('Only Access List manager');
    });
  });

  describe('Pause / Unpause', function () {
    it('should allow Access List manager to pause', async function () {
      const { accessListRegistry, accessListManager } = await loadFixture(deployFixture);

      await expect(accessListRegistry.connect(accessListManager).pause())
        .to.emit(accessListRegistry, 'AccessListPaused');

      expect(await accessListRegistry.isPaused()).to.be.true;
    });

    it('should allow owner to pause', async function () {
      const { accessListRegistry, owner } = await loadFixture(deployFixture);

      await expect(accessListRegistry.connect(owner).pause())
        .to.emit(accessListRegistry, 'AccessListPaused');
    });

    it('should not allow unauthorized user to pause', async function () {
      const { accessListRegistry, unauthorized } = await loadFixture(deployFixture);

      await expect(
        accessListRegistry.connect(unauthorized).pause()
      ).to.be.revertedWith('Only Access List manager');
    });

    it('should allow Access List manager to unpause', async function () {
      const { accessListRegistry, accessListManager } = await loadFixture(deployFixture);

      await accessListRegistry.connect(accessListManager).pause();

      await expect(accessListRegistry.connect(accessListManager).unpause())
        .to.emit(accessListRegistry, 'AccessListUnpaused');

      expect(await accessListRegistry.isPaused()).to.be.false;
    });

    it('should not allow unauthorized user to unpause', async function () {
      const { accessListRegistry, unauthorized, accessListManager } = await loadFixture(deployFixture);

      await accessListRegistry.connect(accessListManager).pause();

      await expect(
        accessListRegistry.connect(unauthorized).unpause()
      ).to.be.revertedWith('Only Access List manager');
    });
  });
});
