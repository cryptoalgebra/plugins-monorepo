// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @title Mock ERC20 token for plugins testing
/// @dev Shared test contract from test-utils package.
/// Named MockERC20 to avoid collision with TestERC20 from integral-core.
contract MockERC20 is ERC20 {
  uint8 private _decimals;

  constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
    _decimals = decimals_;
  }

  function decimals() public view override returns (uint8) {
    return _decimals;
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external {
    _burn(from, amount);
  }
}
