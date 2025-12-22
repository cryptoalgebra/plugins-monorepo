// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @title Test ERC20 token compatible with externalFixtures
/// @dev Constructor signature matches integral-core TestERC20 for compatibility
contract TestERC20 is ERC20 {
  constructor(uint256 amountToMint) ERC20('Test ERC20', 'TEST') {
    _mint(msg.sender, amountToMint);
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external {
    _burn(from, amount);
  }
}
