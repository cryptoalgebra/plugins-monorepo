import { ethers } from 'hardhat';

// ========== Deployed OnchainID infrastructure ==========
const IDENTITY_FACTORY = '0x7a1ca9131139F0A8dbf3CC41f3642BcaAA9a849e';
const CLAIM_ISSUER = '0xd5a5A781c6835a41479c372Eb416381727d8bb0F';
const USER_WALLET = '0xDeaD1F5aF792afc125812E875A891b038f888258';

// Must match requiredTopic configured on the plugin (setKycRequiredTopic)
const CLAIM_TOPIC = 42n;
// Arbitrary claim payload, e.g. hash of the KYC dossier; '0x' is fine for testing
const CLAIM_DATA = '0x';
const CLAIM_SCHEME = 1n; // ECDSA

// Optional: plugin address to check isTraderEligible after adding the claim
const PLUGIN = '0x2Dff18e3d53F185b21A42d7aB4Ef7284D5C9Cfd5';

const ID_FACTORY_ABI = ['function getIdentity(address wallet) view returns (address)'];
const IDENTITY_ABI = [
  'function addClaim(uint256 topic, uint256 scheme, address issuer, bytes signature, bytes data, string uri) returns (bytes32)',
  'function getClaimIdsByTopic(uint256 topic) view returns (bytes32[])',
];
const CLAIM_ISSUER_ABI = [
  'function isClaimValid(address identity, uint256 claimTopic, bytes sig, bytes data) view returns (bool)',
];
const PLUGIN_ABI = ['function isTraderEligible(address wallet) view returns (bool)'];

async function main() {
  const signers = await ethers.getSigners();
  // Signs the claim message — must hold a CLAIM (3) or MANAGEMENT (1) key on the ClaimIssuer
  // (the ClaimIssuer deployer key qualifies)
  const issuerSigner = signers[0];
  // Sends the addClaim tx — must hold a MANAGEMENT/CLAIM key on the user's Identity
  // (the user wallet itself qualifies); falls back to the first signer
  const userSigner = signers[1] ?? signers[0];

  console.log('Issuer signer (signs claim):', issuerSigner.address);
  console.log('User signer (sends addClaim):', userSigner.address);

  // 1. Resolve identity
  const idFactory = new ethers.Contract(IDENTITY_FACTORY, ID_FACTORY_ABI, issuerSigner);
  const identityAddress = await idFactory.getIdentity(USER_WALLET);
  if (identityAddress === ethers.ZeroAddress) throw new Error(`No identity for wallet ${USER_WALLET}`);
  console.log('Identity:', identityAddress);

  // 2. Sign the claim: keccak256(abi.encode(identity, topic, data)) as an eth signed message
  const dataHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'bytes'], [identityAddress, CLAIM_TOPIC, CLAIM_DATA])
  );
  const signature = await issuerSigner.signMessage(ethers.getBytes(dataHash));
  console.log('Claim signature:', signature);

  // 3. Add the claim to the user's identity
  const identity = new ethers.Contract(identityAddress, IDENTITY_ABI, userSigner);
  const tx = await identity.addClaim(CLAIM_TOPIC, CLAIM_SCHEME, CLAIM_ISSUER, signature, CLAIM_DATA, '');
  await tx.wait();
  console.log('Claim added, tx:', tx.hash);

  // 4. Verify the claim the same way the plugin will
  const claimIssuer = new ethers.Contract(CLAIM_ISSUER, CLAIM_ISSUER_ABI, issuerSigner);
  const valid = await claimIssuer.isClaimValid(identityAddress, CLAIM_TOPIC, signature, CLAIM_DATA);
  console.log('isClaimValid:', valid);

  const claimIds = await identity.getClaimIdsByTopic(CLAIM_TOPIC);
  console.log('Claim ids for topic:', claimIds);

  // 5. Optional: full end-to-end check through the plugin
  if (PLUGIN) {
    const plugin = new ethers.Contract(PLUGIN, PLUGIN_ABI, issuerSigner);
    console.log('isTraderEligible:', await plugin.isTraderEligible(USER_WALLET));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
