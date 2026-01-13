// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../RebalanceManager.sol';

contract MockRebalanceManager is RebalanceManager {
  event MockUpdateStatus(bool needToRebalance, State newState);
  event MockDecideRebalance(DecideStatus decideStatus, State newState);

  uint256 public depositTokenBalance;
  uint256 public slowPrice;
  uint256 public fastPrice;
  uint256 public currentPrice;
  uint8 public depositDecimals;
  uint8 public pairedDecimals;

  uint256 public time = 1601906400;

  constructor(
    address _vault,
    uint32 _minTimeBetweenRebalances,
    Thresholds memory _thresholds
  ) RebalanceManager(_vault, _minTimeBetweenRebalances, _thresholds) {}

  function setTokens(address _depositToken, address _pairedToken) public {
    (depositToken, pairedToken) = (_depositToken, _pairedToken);
  }

  function setDepositTokenBalance(uint256 _depositTokenBalance) public {
    depositTokenBalance = _depositTokenBalance;
  }

  function setState(State _state) public {
    state = _state;
  }

  function setAllowToken1(bool _allowToken1) public {
    allowToken1 = _allowToken1;
  }

  function setLastRebalanceCurrentPrice(uint256 _lastRebalanceCurrentPrice) public {
    lastRebalanceCurrentPrice = _lastRebalanceCurrentPrice;
  }

  function setDecimals(uint8 _depositDecimals, uint8 _pairedDecimals) public {
    (depositTokenDecimals, pairedTokenDecimals) = (_depositDecimals, _pairedDecimals);

    decimalsSum = _depositDecimals + _pairedDecimals;
    tokenDecimals = allowToken1 ? _pairedDecimals : _depositDecimals;
  }

  function _getDepositTokenVaultBalance() internal view override returns (uint256) {
    return depositTokenBalance;
  }

  function _getDepositTokenDecimals() internal view override returns (uint8) {
    return depositDecimals;
  }

  function _getPairedTokenDecimals() internal view override returns (uint8) {
    return pairedDecimals;
  }

  function _updateStatus(TwapResult memory twapResult) internal override returns (bool, State) {
    (bool needToRebalance, State newState) = super._updateStatus(twapResult);
    emit MockUpdateStatus(needToRebalance, newState);
    return (needToRebalance, newState);
  }

  function _decideRebalance(TwapResult memory twapResult) internal override returns (DecideStatus, State) {
    (DecideStatus decideStatus, State newState) = super._decideRebalance(twapResult);
    emit MockDecideRebalance(decideStatus, newState);
    return (decideStatus, newState);
  }

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function _blockTimestamp() internal view override returns (uint32) {
    return uint32(time);
  }
}
