// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

interface IMevxRouter {
  function initializePoolExternally(bytes32 poolId, uint16 poolType, bytes memory data) external;

  function initialArbCheck(bytes32 poolId, bool zeroToOne) external view returns (bool isArbPossible, bytes16 priceChange);

  function constructArbitrageRoute(
    bytes32 poolId,
    bool zeroToOne,
    bytes16 priceChange,
    int256 amount0,
    int256 amount1
  ) external returns (bool isArbPossible, address profitToken, address[] memory pools, uint256 optimalAmountIn, bytes memory encodedRoute);

  function getMevProtectionFee(uint16 currentFee) external view returns (uint24 mevProtectionFee);
}
