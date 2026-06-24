// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @dev Constructor-compatible token used by the Algebra core deployment fixture.
contract TestERC20 is ERC20 {
  constructor(uint256 supply) ERC20('Test ERC20', 'TEST') {
    _mint(msg.sender, supply);
  }
}
