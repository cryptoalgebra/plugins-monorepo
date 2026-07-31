// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../interfaces/IMsgSender.sol';

/// @title Mock Router
/// @notice Simulates a router that self-reports the real end-user via IMsgSender.
/// @dev Used both as a "trusted" router (registered via the plugin's setRouterAllowed)
/// and as an "untrusted" one (same code, simply never registered) to prove the two-level check:
/// an unregistered contract's report is ignored entirely, and its own address is checked instead.
contract MockRouter is IMsgSender {
  address public reportedSender;

  constructor(address _reportedSender) {
    reportedSender = _reportedSender;
  }

  function setReportedSender(address _reportedSender) external {
    reportedSender = _reportedSender;
  }

  /// @inheritdoc IMsgSender
  function msgSender() external view override returns (address) {
    return reportedSender;
  }

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

  function callMint(address pool, address recipient, int24 bottomTick, int24 topTick, uint128 liquidityDesired) external {
    (bool success, bytes memory returnData) = pool.call(
      abi.encodeWithSignature('mint(address,address,int24,int24,uint128,bytes)', address(this), recipient, bottomTick, topTick, liquidityDesired, '')
    );
    if (!success) {
      if (returnData.length > 0) {
        assembly {
          revert(add(32, returnData), mload(returnData))
        }
      }
      revert('call failed');
    }
  }

  function callFlash(address pool, address recipient, uint256 amount0, uint256 amount1) external {
    (bool success, bytes memory returnData) = pool.call(abi.encodeWithSignature('flash(address,uint256,uint256,bytes)', recipient, amount0, amount1, ''));
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
