// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @title ERC20 whose transfer returns nothing, the shape SafeTransfer exists for
/// @dev Stands in for tokens such as USDT that predate the return value in the standard. Only the
/// surface collectPluginFee touches is implemented, MockERC20 stays the token for everything else.
contract MockNoReturnERC20 {
  mapping(address => uint256) public balanceOf;

  function mint(address to, uint256 amount) external {
    balanceOf[to] += amount;
  }

  /// @dev No return value on purpose, that is the whole point of this mock
  function transfer(address to, uint256 amount) external {
    require(balanceOf[msg.sender] >= amount, 'insufficient balance');
    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
  }
}
