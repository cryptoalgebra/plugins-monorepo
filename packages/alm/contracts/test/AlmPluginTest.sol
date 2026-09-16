// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../base/BaseRebalanceManager.sol';
import './MockVault.sol';

contract AlmPluginTest is BaseRebalanceManager {
  uint256 public depositTokenBalance;
  uint256 public slowPrice;
  uint256 public fastPrice;
  uint256 public currentPrice;
  uint8 public depositDecimals;
  uint8 public pairedDecimals;

  /// @dev Every input a replayed reading injects. The corpora replay about two thousand readings,
  /// and one call replaces six for each of them.
  struct Reading {
    uint8 depositDecimals;
    uint8 pairedDecimals;
    uint256 totalAmount0;
    uint256 totalAmount1;
    uint256 slowPrice;
    uint256 fastPrice;
    uint256 currentPrice;
    uint256 depositTokenBalance;
    uint256 lastRebalanceCurrentPrice;
    State state;
  }

  constructor(address _vault, uint32 _minTimeBetweenRebalances, Thresholds memory _thresholds, int24 _tickSpacing) {
    paused = false;

    vault = _vault;
    pool = address(0);

    tickSpacing = _tickSpacing;

    bool _allowToken1 = IAlgebraVault(vault).allowToken1();

    minTimeBetweenRebalances = _minTimeBetweenRebalances;

    allowToken1 = _allowToken1;
    state = State.OverInventory;
    lastRebalanceTimestamp = 0;
    lastRebalanceCurrentPrice = 0;
    thresholds = _thresholds;

    address token0 = IAlgebraVault(_vault).token0();
    address token1 = IAlgebraVault(_vault).token1();

    address _pairedToken = _allowToken1 ? token0 : token1;
    pairedToken = _pairedToken;
    uint8 _pairedTokenDecimals = _getPairedTokenDecimals();
    pairedTokenDecimals = _pairedTokenDecimals;

    address _depositToken = _allowToken1 ? token1 : token0;
    depositToken = _depositToken;
    uint8 _depositTokenDecimals = _getDepositTokenDecimals();
    depositTokenDecimals = _depositTokenDecimals;

    decimalsSum = _depositTokenDecimals + _pairedTokenDecimals;
    tokenDecimals = _allowToken1 ? _pairedTokenDecimals : _depositTokenDecimals;
  }

  function rebalance(int24 currentTick, int24 slowTwapTick, int24 fastTwapTick, uint32 lastBlockTimestamp) public {
    TwapResult memory twapResult = _obtainTWAPs(currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp);
    _rebalance(twapResult);
  }

  function setReading(Reading calldata reading) external {
    setDecimals(reading.depositDecimals, reading.pairedDecimals);
    MockVault(vault).setTotalAmounts(reading.totalAmount0, reading.totalAmount1);
    setPrices(reading.slowPrice, reading.fastPrice, reading.currentPrice);
    depositTokenBalance = reading.depositTokenBalance;
    lastRebalanceCurrentPrice = reading.lastRebalanceCurrentPrice;
    state = reading.state;
  }

  function setDepositTokenBalance(uint256 _depositTokenBalance) public {
    depositTokenBalance = _depositTokenBalance;
  }

  /// @dev The base reads authorization off the Algebra factory, and this harness has no pool to get
  /// one from. Tests that reach an authorized entry point set it explicitly.
  function setFactory(address _factory) public {
    factory = _factory;
  }

  function setState(State _state) public {
    state = _state;
  }

  function setPrices(uint256 _slowPrice, uint256 _fastPrice, uint256 _currentPrice) public {
    slowPrice = _slowPrice;
    fastPrice = _fastPrice;
    currentPrice = _currentPrice;
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

  function _getTwapPrices(address, address, uint8, int24, int24, int24) internal view override returns (uint256, uint256, uint256) {
    return (slowPrice, fastPrice, currentPrice);
  }
}
