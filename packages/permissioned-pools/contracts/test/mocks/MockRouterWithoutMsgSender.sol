// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock Router Without IMsgSender
/// @notice A contract that reaches the pool the way a router does but never implements msgSender().
/// @dev Stands in for the operational mistake of approving an ordinary contract as a router: the plugin
/// resolves the real sender through IMsgSender, the call finds no matching selector and no fallback,
/// and the plugin has to turn that into its own error rather than pass the bare revert on.
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
