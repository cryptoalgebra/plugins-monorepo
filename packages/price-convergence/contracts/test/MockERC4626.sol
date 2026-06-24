// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol';

contract MockERC4626 is ERC4626 {
  uint8 private immutable _offset;

  constructor(IERC20 asset_, uint8 offset_) ERC20('Mock ERC4626', 'm4626') ERC4626(asset_) {
    _offset = offset_;
  }

  function _decimalsOffset() internal view override returns (uint8) {
    return _offset;
  }
}
