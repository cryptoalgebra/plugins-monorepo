// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.13;

interface IPythLazer {
  function verification_fee() external view returns (uint256);

  function verifyUpdate(bytes calldata update) external payable returns (bytes memory payload, address signer);
}
