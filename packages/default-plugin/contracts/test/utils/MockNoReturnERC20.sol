// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @title ERC20 whose transfer returns nothing, the shape SafeTransfer exists for
/// @dev Stands in for tokens like USDT
/// @dev Implements only what collectPluginFee touches
contract MockNoReturnERC20 {
  mapping(address => uint256) public balanceOf;

  function mint(address to, uint256 amount) external {
    balanceOf[to] += amount;
  }

  /// @dev No return value on purpose
  function transfer(address to, uint256 amount) external {
    require(balanceOf[msg.sender] >= amount, 'insufficient balance');
    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
  }
}
