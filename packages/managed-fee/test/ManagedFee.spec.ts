import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { Wallet, AbiCoder, keccak256 } from 'ethers'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import snapshotGasCost from 'test-utils/snapshotGasCost';

describe('ManagedSwapFee', () => {
  let wallet: Wallet, other: Wallet;
  let managedSwapFeePlugin: any;
  let pluginData: string;
  let nonce: string;
  let fee: number;
  let user: string;
  let expireTime: number;

  // expireTime is signed, and the signature travels in calldata, so its zero bytes set the intrinsic
  // cost of the transaction. Taking the time from the block made the gas snapshot flicker by 12 gas.
  // Near the top of the uint32 range so it stays in the future whatever clock the network starts on.
  const FIXED_EXPIRE_TIME = 4_000_000_000;

  async function managedSwapFeeFixture() {
    const ManagedFeePluginImplementation = await ethers.getContractFactory('ManagedFeePluginImplementation');
    const managedFeeImpl = await ManagedFeePluginImplementation.deploy();

    const ManagedFeeTest = await ethers.getContractFactory('ManagedFeeTest');
    return await ManagedFeeTest.deploy(managedFeeImpl.target);
  }

  async function generatePluginData(nonce: string, fee: number, user: string, expireTime: number, signer: Wallet): Promise<string> {
    let hash = keccak256(AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint24', 'address', 'uint32'],
      [nonce, fee, user, expireTime])
    );

    const hashBytes = Buffer.from(hash.slice(2), 'hex');
    let signature = await signer.signMessage(hashBytes);

    return AbiCoder.defaultAbiCoder().encode(
      ['tuple(bytes32, uint24, address, uint32, bytes)'],
      [[nonce, fee, user, expireTime, signature]]
    );
  }

  beforeEach('deploy ManagedSwapFeeTest', async () => {
    [wallet, other] = await (ethers as any).getSigners();
    managedSwapFeePlugin = await loadFixture(managedSwapFeeFixture);
  });

  describe('#getManagedFee', () => {
    beforeEach('set config', async () => {
      nonce ="0x0000000000000000000000000000000000000000000000000000000000000001"
      fee = 1000
      user = wallet.address
      expireTime = FIXED_EXPIRE_TIME

      pluginData = await generatePluginData(nonce, fee, user, expireTime, wallet)
      await managedSwapFeePlugin.setWhitelistStatus(wallet.address, true);

    });

    it('fee is used on swap', async () => {
      await expect(managedSwapFeePlugin.connect(wallet).getFeeForSwap(pluginData))
        .to.be.emit(managedSwapFeePlugin, 'Fee')
        .withArgs(1000)
    });

    it('revert if signer is not whitelisted', async () => {
      pluginData = await generatePluginData(nonce, fee, user, expireTime, other)
      await expect(managedSwapFeePlugin.connect(wallet).getFeeForSwap(pluginData)).to.be.revertedWithCustomError(managedSwapFeePlugin,"NotWhitelisted")
    });

    it('nonce can not be used twice', async () => {
      await managedSwapFeePlugin.connect(wallet).getFeeForSwap(pluginData)
      await expect(managedSwapFeePlugin.connect(wallet).getFeeForSwap(pluginData)).to.be.revertedWithCustomError(managedSwapFeePlugin,"InvalidNonce")
    });

    it('fee can not exceed 100%', async () => {
      fee = 1000000 // 100%
      pluginData = await generatePluginData(nonce, fee, user, expireTime, wallet)
      await expect(managedSwapFeePlugin.connect(wallet).getFeeForSwap(pluginData)).to.be.revertedWithCustomError(managedSwapFeePlugin,"FeeExceedsLimit")
    });

    it('revert if signature expired', async () => {
      let provider = ethers.provider
      const block = await provider.getBlock('latest');

      expireTime = block!.timestamp - 1
      pluginData = await generatePluginData(nonce, fee, user, expireTime, wallet)
      await expect(managedSwapFeePlugin.connect(wallet).getFeeForSwap(pluginData)).to.be.revertedWithCustomError(managedSwapFeePlugin,"Expired")
    });

    it('revert if user and caller missmatch', async () => {
      await expect(managedSwapFeePlugin.connect(other).getFeeForSwap(pluginData)).to.be.revertedWithCustomError(managedSwapFeePlugin,"NotAllowed")
    });

    it('gas cost [ @skip-on-coverage ]', async () => {
      await snapshotGasCost(managedSwapFeePlugin.getFeeForSwap(pluginData));
    });

  });

});