// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

/// @title Mock Router Without IMsgSender
/// @notice Reaches the pool like a router but has no msgSender()
/// @dev Models a plain contract approved as a router by mistake
/// @dev The plugin must turn the failed msgSender() call into its own error
contract MockRouterWithoutMsgSender {
  function callSwap(address pool, int24 targetTick) external {
    (bool success, bytes memory returnData) = pool.call(abi.encodeWithSignature('swapToTick(int24)', targetTick));
    if (!success) {
      if (returnData.length > 0) {
        assembly {
          revert(add(32, returnData), mload(returnData))
        }
      }
      revert('call failed');
    }
  }
}
