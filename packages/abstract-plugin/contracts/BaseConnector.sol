// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Base Connector
/// @notice Abstract base contract for all plugin connectors providing common delegatecall utilities
abstract contract BaseConnector {
  error ConnectorDelegatecallFailed();

  /// @dev Execute delegatecall and revert with original error if failed
  /// @param implementation The implementation address to delegatecall
  /// @param data The encoded function call data
  /// @return returnData The return data from the delegatecall
  function _delegateCall(address implementation, bytes memory data) internal returns (bytes memory returnData) {
    bool success;
    (success, returnData) = implementation.delegatecall(data);
    if (!success) {
      if (returnData.length > 0) {
        assembly {
          revert(add(32, returnData), mload(returnData))
        }
      }
      revert ConnectorDelegatecallFailed();
    }
  }

  /// @dev Must be implemented by inheriting contract to check authorization
  function _authorize() internal view virtual;
}
