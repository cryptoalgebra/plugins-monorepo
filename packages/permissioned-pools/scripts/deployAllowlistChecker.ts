import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address (used for PERMISSIONED_POOL_MANAGER role checks)
  algebraFactory: "0x000000000000000000000000000000000000000000",

  // Admin address for the OnchainIdAllowlistChecker (manages trusted issuers / required topic)
  checkerAdmin: "0x000000000000000000000000000000000000000000",

  // OnchainID identity factory used to resolve a wallet's identity contract
  identityFactory: "0x000000000000000000000000000000000000000000",

  // Claim topic required for eligibility
  requiredTopic: 1,

  // Trusted claim issuers to register on the checker at deploy time (optional)
  trustedIssuers: [] as string[],

  // Tokens to immediately point at the deployed checker via the registry (optional)
  // Requires the deployer to hold PERMISSIONED_POOL_MANAGER on algebraFactory
  tokens: [] as string[],
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  // ============= 1. DEPLOY ALLOWLIST CHECKER REGISTRY =============
  console.log("=== Deploying Allowlist Checker Registry ===");

  const AllowlistCheckerRegistry = await ethers.getContractFactory("AllowlistCheckerRegistry");
  const registry = await AllowlistCheckerRegistry.deploy(config.algebraFactory);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("AllowlistCheckerRegistry:", registryAddress);
  console.log("");

  // ============= 2. DEPLOY ONCHAIN ID ALLOWLIST CHECKER =============
  console.log("=== Deploying Onchain ID Allowlist Checker ===");

  const OnchainIdAllowlistChecker = await ethers.getContractFactory("OnchainIdAllowlistChecker");
  const checker = await OnchainIdAllowlistChecker.deploy(config.checkerAdmin, config.identityFactory, config.requiredTopic);
  await checker.waitForDeployment();
  const checkerAddress = await checker.getAddress();
  console.log("OnchainIdAllowlistChecker:", checkerAddress);
  console.log("");

  // ============= 3. POST-DEPLOYMENT CONFIGURATION =============
  console.log("=== Post-Deployment Configuration ===");

  // Register trusted claim issuers (requires deployer == checkerAdmin)
  if (config.trustedIssuers.length > 0 && deployer.address.toLowerCase() === config.checkerAdmin.toLowerCase()) {
    const trusted = config.trustedIssuers.map(() => true);
    const tx1 = await checker.setTrustedIssuersBatch(config.trustedIssuers, trusted);
    await tx1.wait();
    console.log("Set trusted issuers:", config.trustedIssuers);
  } else if (config.trustedIssuers.length > 0) {
    console.log("Skipped setting trusted issuers - deployer is not checkerAdmin, run setTrustedIssuersBatch separately");
  }

  // Point tokens at the checker (requires deployer to hold PERMISSIONED_POOL_MANAGER)
  for (const token of config.tokens) {
    const tx2 = await registry.setChecker(token, checkerAddress);
    await tx2.wait();
    console.log("Set checker for token:", token);
  }

  console.log("");

  // ============= SUMMARY =============
  console.log("========================================");
  console.log("=== DEPLOYMENT COMPLETE ===");
  console.log("========================================");
  console.log("");
  console.log("AllowlistCheckerRegistry:", registryAddress);
  console.log("OnchainIdAllowlistChecker:", checkerAddress);
  console.log("");
  console.log("Next steps:");
  console.log("- setChecker(token, checker) on the registry for each permissioned token (PERMISSIONED_POOL_MANAGER only)");
  console.log("- pass the registry address to default-plugin/scripts/deployUpgradeable.ts (config.allowlistCheckerRegistry),");
  console.log("  or call factory.setAllowlistCheckerRegistry(registry) on an already-deployed AlgebraUpgradeablePluginFactory");
  if (config.checkerAdmin === ZERO_ADDRESS) {
    console.log("- WARNING: checkerAdmin is unset (zero address) - set it before relying on this checker");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
