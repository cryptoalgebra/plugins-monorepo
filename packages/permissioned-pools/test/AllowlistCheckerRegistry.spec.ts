import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('AllowlistCheckerRegistry', function () {
  async function deployFixture() {
    const [owner, manager, other] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const AllowlistCheckerRegistry = await ethers.getContractFactory('AllowlistCheckerRegistry');
    const registry = await AllowlistCheckerRegistry.deploy(mockFactory.target);

    const PERMISSIONED_POOL_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('PERMISSIONED_POOL_MANAGER'));
    await mockFactory.grantRole(PERMISSIONED_POOL_MANAGER, manager.address);

    const MockAllowlistChecker = await ethers.getContractFactory('MockAllowlistChecker');
    const checker = await MockAllowlistChecker.deploy();

    const MockNonChecker = await ethers.getContractFactory('MockNonChecker');
    const nonChecker = await MockNonChecker.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Token', 'TK', 18);

    return { owner, manager, other, mockFactory, registry, checker, nonChecker, token, PERMISSIONED_POOL_MANAGER };
  }

  it('sets a checker for a token', async function () {
    const { registry, manager, checker, token } = await loadFixture(deployFixture);

    await expect(registry.connect(manager).setChecker(token.target, checker.target))
      .to.emit(registry, 'CheckerUpdated')
      .withArgs(token.target, checker.target);

    expect(await registry.getChecker(token.target)).to.equal(checker.target);
  });

  it('clears a checker with address(0) without an interface check', async function () {
    const { registry, manager, checker, token } = await loadFixture(deployFixture);

    await registry.connect(manager).setChecker(token.target, checker.target);
    await registry.connect(manager).setChecker(token.target, ethers.ZeroAddress);

    expect(await registry.getChecker(token.target)).to.equal(ethers.ZeroAddress);
  });

  it('rejects a checker that does not support IAllowlistChecker', async function () {
    const { registry, manager, nonChecker, token } = await loadFixture(deployFixture);

    await expect(registry.connect(manager).setChecker(token.target, nonChecker.target)).to.be.revertedWithCustomError(
      registry,
      'CheckerDoesNotSupportInterface'
    );
  });

  it('rejects setChecker from a non-manager', async function () {
    const { registry, other, checker, token } = await loadFixture(deployFixture);

    await expect(registry.connect(other).setChecker(token.target, checker.target)).to.be.revertedWith('Only Permissioned Pool manager');
  });

  it('allows the owner to call setChecker without an explicit role grant', async function () {
    const { registry, owner, checker, token } = await loadFixture(deployFixture);

    await expect(registry.connect(owner).setChecker(token.target, checker.target)).to.not.be.reverted;
  });
});
