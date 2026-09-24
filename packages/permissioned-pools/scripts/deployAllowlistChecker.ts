import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address (used for PERMISSIONED_POOL_MANAGER role checks)
  algebraFactory: "0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04", // X Layer

  // Admin of the OnchainIdAllowlistChecker: the only account that can set trusted issuers
  // and the required topic. Immutable in the contract, so a wrong value means redeploying.
  // Leave zero to use the deployer.
  checkerAdmin: "0x0000000000000000000000000000000000000000",

  // Reuse an already deployed AllowlistCheckerRegistry. Leave empty to deploy a new one.
  existingRegistry: "0xB8C2125a316429669bD8CE88fB674843E71caDE8",

  // OnchainID identity factory used to resolve a wallet's identity contract
  identityFactory: "0x520341700b76c30089E0a14Bf6CF78716Da39AC6", // ONCHAINID IdFactory on X Layer

  // Claim topic required for eligibility
  requiredTopic: 1,

  // Trusted claim issuers to register on the checker at deploy time (optional)
  trustedIssuers: ["0xB5A82D5e8E30dAc53519907470c8c5143b1d178A"] as string[], // ClaimIssuer on X Layer

  // Tokens to immediately point at the deployed checker via the registry (optional)
  // Requires the deployer to hold PERMISSIONED_POOL_MANAGER on algebraFactory
  tokens: ["0x5F8a1C74C112865BD05dbe4752C7608332719062"] as string[], // deJAAA
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  const checkerAdmin = config.checkerAdmin === ZERO_ADDRESS ? deployer.address : config.checkerAdmin;
  if (checkerAdmin === ZERO_ADDRESS) throw new Error("checkerAdmin resolves to the zero address");
  console.log("Checker admin:", checkerAdmin);
  console.log("");

  // ============= 1. ALLOWLIST CHECKER REGISTRY =============

  let registry;
  let registryAddress = config.existingRegistry;

  if (registryAddress === "") {
    console.log("=== Deploying Allowlist Checker Registry ===");
    const AllowlistCheckerRegistry = await ethers.getContractFactory("AllowlistCheckerRegistry");
    registry = await AllowlistCheckerRegistry.deploy(config.algebraFactory);
    await registry.waitForDeployment();
    registryAddress = await registry.getAddress();
    console.log("AllowlistCheckerRegistry:", registryAddress);
  } else {
    console.log(`=== Reusing Allowlist Checker Registry at ${registryAddress} ===`);
    registry = await ethers.getContractAt("AllowlistCheckerRegistry", registryAddress);
  }
  console.log("");

  // ============= 2. DEPLOY ONCHAIN ID ALLOWLIST CHECKER =============
  console.log("=== Deploying Onchain ID Allowlist Checker ===");

  const OnchainIdAllowlistChecker = await ethers.getContractFactory("OnchainIdAllowlistChecker");
  const checker = await OnchainIdAllowlistChecker.deploy(checkerAdmin, config.identityFactory, config.requiredTopic);
  await checker.waitForDeployment();
  const checkerAddress = await checker.getAddress();
  console.log("OnchainIdAllowlistChecker:", checkerAddress);
  console.log("");

  // ============= 3. POST-DEPLOYMENT CONFIGURATION =============
  console.log("=== Post-Deployment Configuration ===");

  // Register trusted claim issuers (requires deployer == checkerAdmin)
  if (config.trustedIssuers.length > 0 && deployer.address.toLowerCase() === checkerAdmin.toLowerCase()) {
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
  console.log(`- checker admin is ${checkerAdmin} (immutable)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
