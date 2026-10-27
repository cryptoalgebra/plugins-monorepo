// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.26;

/// @dev Router that quotes a settable MEV protection fee and never finds an arbitrage
contract MockMevxRouter {
  uint24 public mevProtectionFee;

  function setMevProtectionFee(uint24 fee) external {
    mevProtectionFee = fee;
  }

  function getMevProtectionFee(uint16) external view returns (uint24) {
    return mevProtectionFee;
  }

  function initializePoolExternally(bytes32, uint16, bytes memory) external {}

  function initialArbCheck(bytes32, bool) external pure returns (bool, bytes16) {
    return (false, 0);
  }
}

/// @dev Records each distribution so a test can tell it happened
contract MockProfitDistributor {
  event ProfitDistributed(bytes32 configId, address token, address swapRecipient);

  function distributeProfit(bytes32 configId, address token, address swapRecipient) external {
    emit ProfitDistributed(configId, token, swapRecipient);
  }
}
