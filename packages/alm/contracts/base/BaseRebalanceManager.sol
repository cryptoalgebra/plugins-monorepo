// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/alm-vault/contracts/interfaces/IAlgebraVault.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/base/common/Timestamp.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

import '../interfaces/IRebalanceManager.sol';

abstract contract BaseRebalanceManager is IRebalanceManager, Timestamp {
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  struct TwapResult {
    uint256 currentPriceAccountingDecimals;
    uint256 slowAvgPriceAccountingDecimals;
    uint256 fastAvgPriceAccountingDecimals;
    uint256 totalPairedInDeposit;
    uint256 totalDepositToken;
    uint256 totalPairedToken;
    int24 currentTick;
    uint16 percentageOfDepositTokenUnused; // 10000 = 100%
    uint16 percentageOfDepositToken; // 10000 = 100%
    bool sameBlock;
  }

  struct Ranges {
    int24 baseLower;
    int24 baseUpper;
    int24 limitLower;
    int24 limitUpper;
  }

  enum State {
    OverInventory,
    Normal,
    UnderInventory,
    Special
  }

  enum DecideStatus {
    Normal,
    Special,
    NoNeed,
    TooSoon,
    NoNeedWithPending,
    ExtremeVolatility
  }

  struct Thresholds {
    uint16 idleDepositRatio;
    uint16 maxDepositRatio;
    uint16 balancedStateMin;
    uint16 lowInventoryLevel;
    uint16 highInventoryLevel;
    uint16 priceShiftTrigger;
    uint16 criticalDeviation;
    uint16 majorDeviation;
    uint16 minorDeviation;
    uint16 ratioBuffer;
    uint16 baseRangeLower;
    uint16 baseRangeUpper;
    uint16 limitAllocation;
  }

  address public vault;
  bool public paused;
  bool public allowToken1;
  State public state;
  uint32 public lastRebalanceTimestamp;
  uint256 public lastRebalanceCurrentPrice;
  Thresholds public thresholds;

  address public pairedToken;
  uint8 public pairedTokenDecimals;
  address public depositToken;
  uint8 public depositTokenDecimals;
  uint8 public decimalsSum;
  uint8 public tokenDecimals;
  int24 public tickSpacing;
  address public factory;
  address public pool;
  uint32 public minTimeBetweenRebalances;

  function setPriceShiftTrigger(uint16 _priceShiftTrigger) external {
    _authorize();
    require(_priceShiftTrigger < 10000, 'Invalid price shift trigger');
    thresholds.priceShiftTrigger = _priceShiftTrigger;
    emit SetPriceShiftTrigger(_priceShiftTrigger);
  }

  function setRangeParams(uint16 _baseRangeLower, uint16 _baseRangeUpper, uint16 _limitAllocation) external {
    _authorize();
    require(_baseRangeLower >= 100 && _baseRangeLower <= 10000, 'Invalid base range lower');
    require(_baseRangeUpper >= 100 && _baseRangeUpper <= 10000, 'Invalid base range upper');
    require(_limitAllocation >= 100 && _limitAllocation <= 10000 - thresholds.maxDepositRatio, 'Invalid limit allocation');
    thresholds.baseRangeLower = _baseRangeLower;
    thresholds.baseRangeUpper = _baseRangeUpper;
    thresholds.limitAllocation = _limitAllocation;
    emit SetRangeParams(_baseRangeLower, _baseRangeUpper, _limitAllocation);
  }

  function setInventoryLevels(uint16 _maxDepositRatio, uint16 _balancedStateMin, uint16 _lowInventoryLevel, uint16 _highInventoryLevel) external {
    _authorize();
    require(_lowInventoryLevel > 6000, '_lowInventoryLevel must be > 6000');
    require(_balancedStateMin > _lowInventoryLevel, '_balancedStateMin must be > _lowInventoryLevel');
    require(_highInventoryLevel > _balancedStateMin, '_highInventoryLevel must be > _balancedStateMin');
    require(_maxDepositRatio > _highInventoryLevel, '_maxDepositRatio must be > _highInventoryLevel');
    require(_maxDepositRatio < 9500, '_maxDepositRatio must be < 9500');
    require(thresholds.limitAllocation <= 10000 - _maxDepositRatio, 'limitAllocation incompatible with new maxDepositRatio');
    require(thresholds.ratioBuffer < _lowInventoryLevel, 'ratioBuffer must be < lowInventoryLevel');
    thresholds.maxDepositRatio = _maxDepositRatio;
    thresholds.balancedStateMin = _balancedStateMin;
    thresholds.lowInventoryLevel = _lowInventoryLevel;
    thresholds.highInventoryLevel = _highInventoryLevel;
    emit SetInventoryLevels(_maxDepositRatio, _balancedStateMin, _lowInventoryLevel, _highInventoryLevel);
  }

  function setRatioBuffer(uint16 _ratioBuffer) external {
    _authorize();
    require(_ratioBuffer <= 10000, '_ratioBuffer must be <= 10000');
    require(_ratioBuffer < thresholds.lowInventoryLevel, '_ratioBuffer must be < lowInventoryLevel');
    thresholds.ratioBuffer = _ratioBuffer;
    emit SetRatioBuffer(_ratioBuffer);
  }

  function setMajorDeviation(uint16 _majorDeviation) external {
    _authorize();
    require(_majorDeviation >= thresholds.minorDeviation, '_majorDeviation must be >= minorDeviation');
    require(_majorDeviation <= thresholds.criticalDeviation, '_majorDeviation must be <= criticalDeviation');
    require(_majorDeviation <= 10000, '_majorDeviation must be <= 10000');
    thresholds.majorDeviation = _majorDeviation;
    emit SetMajorDeviation(_majorDeviation);
  }

  function setMinorDeviation(uint16 _minorDeviation) external {
    _authorize();
    require(_minorDeviation <= 300, '_minorDeviation must be <= 300');
    require(_minorDeviation <= thresholds.majorDeviation, '_minorDeviation must be <= majorDeviation');
    require(_minorDeviation <= 10000, '_minorDeviation must be <= 10000');
    thresholds.minorDeviation = _minorDeviation;
    emit SetMinorDeviation(_minorDeviation);
  }

  function setCriticalDeviation(uint16 _criticalDeviation) external {
    _authorize();
    require(_criticalDeviation >= thresholds.majorDeviation, '_criticalDeviation must be >= majorDeviation');
    require(_criticalDeviation <= 10000, '_criticalDeviation must be <= 10000');
    thresholds.criticalDeviation = _criticalDeviation;
    emit SetCriticalDeviation(_criticalDeviation);
  }

  function setIdleDepositRatio(uint16 _idleDepositRatio) external {
    _authorize();
    require(
      _idleDepositRatio >= 100 && _idleDepositRatio <= 10000,
      '_idleDepositRatio must be 100 <= _idleDepositRatio <= 10000'
    );
    thresholds.idleDepositRatio = _idleDepositRatio;
    emit SetIdleDepositRatio(_idleDepositRatio);
  }

  function setMinTimeBetweenRebalances(uint32 _minTimeBetweenRebalances) external {
    _authorize();
    minTimeBetweenRebalances = _minTimeBetweenRebalances;
    emit SetMinTimeBetweenRebalances(_minTimeBetweenRebalances);
  }

  function setVault(address _vault) external {
    _authorize();
    vault = _vault;
    emit SetVault(_vault);
  }

  function unpause() external {
    _authorize();
    require(paused, 'Already unpaused');
    paused = false;
    emit Unpaused();
  }

  function obtainTWAPAndRebalance(int24 currentTick, int24 slowTwapTick, int24 fastTwapTick, uint32 lastBlockTimestamp) external {
    require(msg.sender == IAlgebraPool(pool).plugin(), 'Should only called by plugin');
    if (vault == address(0)) return;
    TwapResult memory twapResult = _obtainTWAPs(currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp);
    _rebalance(twapResult);
  }

  function _rebalance(TwapResult memory obtainTWAPsResult) internal {
    if (paused) return;
    if (obtainTWAPsResult.totalDepositToken + obtainTWAPsResult.totalPairedInDeposit == 0) return;
    if (
      obtainTWAPsResult.currentPriceAccountingDecimals == 0 ||
      obtainTWAPsResult.slowAvgPriceAccountingDecimals == 0 ||
      obtainTWAPsResult.fastAvgPriceAccountingDecimals == 0
    ) return;

    (DecideStatus decideStatus, State newState) = _decideRebalance(obtainTWAPsResult);

    if (decideStatus == DecideStatus.NoNeed || decideStatus == DecideStatus.TooSoon) return;

    if (decideStatus != DecideStatus.NoNeedWithPending) {
      if (decideStatus != DecideStatus.ExtremeVolatility) {
        Ranges memory ranges;
        if (decideStatus == DecideStatus.Normal) {
          if (
            obtainTWAPsResult.currentPriceAccountingDecimals == 0 ||
            obtainTWAPsResult.totalDepositToken == 0 ||
              (newState == State.Normal &&
              obtainTWAPsResult.totalPairedInDeposit <=
              _calcPart(obtainTWAPsResult.totalDepositToken + obtainTWAPsResult.totalPairedInDeposit, thresholds.limitAllocation))
          ) return;
          ranges = _getRangesWithState(newState, obtainTWAPsResult);
        } else {
          ranges = _getRangesWithoutState(obtainTWAPsResult);
        }

        if (ranges.baseUpper - ranges.baseLower <= 300 || ranges.limitUpper - ranges.limitLower <= 300) return;

        require(gasleft() >= 1600000, 'Not enough gas left');
        try IAlgebraVault(vault).rebalance(ranges.baseLower, ranges.baseUpper, ranges.limitLower, ranges.limitUpper, 0) {
          lastRebalanceTimestamp = _blockTimestamp();
          lastRebalanceCurrentPrice = obtainTWAPsResult.currentPriceAccountingDecimals;
          state = newState;
        } catch {
          state = State.Special;
          _pause();
        }
      } else {
        IAlgebraVault(vault).setDepositMax(0, 0);
        state = State.Special;
        _pause();
      }
    } else {
      lastRebalanceTimestamp = _blockTimestamp();
      lastRebalanceCurrentPrice = obtainTWAPsResult.currentPriceAccountingDecimals;
    }
  }

  function _obtainTWAPs(
    int24 currentTick,
    int24 slowTwapTick,
    int24 fastTwapTick,
    uint32 lastBlockTimestamp
  ) internal view returns (TwapResult memory twapResult) {
    twapResult.currentTick = currentTick;
    twapResult.sameBlock = _blockTimestamp() == lastBlockTimestamp;
    bool _allowToken1 = allowToken1;

    if (_allowToken1) {
      (uint256 amount0, uint256 amount1) = IAlgebraVault(vault).getTotalAmounts();
      twapResult.totalPairedToken = amount0;
      twapResult.totalDepositToken = amount1;
    } else {
      (uint256 amount0, uint256 amount1) = IAlgebraVault(vault).getTotalAmounts();
      twapResult.totalPairedToken = amount1;
      twapResult.totalDepositToken = amount0;
    }

    address _depositToken = depositToken;
    address _pairedToken = pairedToken;

    uint8 _pairedTokenDecimals = pairedTokenDecimals;

    (uint256 slowPrice, uint256 fastPrice, uint256 currentPriceAccountingDecimals) = _getTwapPrices(
      _depositToken,
      _pairedToken,
      _pairedTokenDecimals,
      slowTwapTick,
      fastTwapTick,
      twapResult.currentTick
    );
    twapResult.slowAvgPriceAccountingDecimals = slowPrice;
    twapResult.fastAvgPriceAccountingDecimals = fastPrice;

    twapResult.currentPriceAccountingDecimals = currentPriceAccountingDecimals;
    uint256 totalPairedInDepositWithDecimals = currentPriceAccountingDecimals * twapResult.totalPairedToken;
    uint256 totalPairedInDeposit = totalPairedInDepositWithDecimals / (10 ** _pairedTokenDecimals);
    twapResult.totalPairedInDeposit = totalPairedInDeposit;

    if (totalPairedInDeposit == 0) {
      twapResult.percentageOfDepositToken = 10000;
    } else {
      uint256 totalTokensAmount = twapResult.totalDepositToken + twapResult.totalPairedInDeposit;
      uint16 percentageOfDepositToken = totalTokensAmount == 0 ? 0 : uint16((twapResult.totalDepositToken * 10000) / totalTokensAmount);
      twapResult.percentageOfDepositToken = percentageOfDepositToken;
    }

    uint256 depositTokenBalance = _getDepositTokenVaultBalance();

    if (depositTokenBalance > 0) {
      uint256 totalTokensAmount = twapResult.totalDepositToken + twapResult.totalPairedInDeposit;
      twapResult.percentageOfDepositTokenUnused = uint16((depositTokenBalance * 10000) / totalTokensAmount);
    } else {
      twapResult.percentageOfDepositTokenUnused = 0;
    }
  }

  function _decideRebalance(TwapResult memory twapResult) internal virtual returns (DecideStatus, State) {
    uint256 fastSlowDiff = _calcPercentageDiff(twapResult.fastAvgPriceAccountingDecimals, twapResult.slowAvgPriceAccountingDecimals);
    uint256 fastCurrentDiff = _calcPercentageDiff(twapResult.fastAvgPriceAccountingDecimals, twapResult.currentPriceAccountingDecimals);

    bool isExtremeVolatility = fastSlowDiff >= thresholds.criticalDeviation || fastCurrentDiff >= thresholds.criticalDeviation;
    if (!isExtremeVolatility) {
      bool isHighVolatility = fastSlowDiff >= thresholds.majorDeviation || fastCurrentDiff >= thresholds.majorDeviation;
      if (!isHighVolatility) {
        if (
          !((state == State.OverInventory || state == State.Normal) &&
            lastRebalanceCurrentPrice != 0 &&
            twapResult.percentageOfDepositToken < thresholds.lowInventoryLevel - thresholds.ratioBuffer)
        ) {
          if (_blockTimestamp() < lastRebalanceTimestamp + minTimeBetweenRebalances) {
            return (DecideStatus.TooSoon, State.Special);
          }

          (bool needToRebalance, State newState) = _updateStatus(twapResult);
          if (needToRebalance) {
            if (fastCurrentDiff < thresholds.minorDeviation) {
              return (DecideStatus.Normal, newState); // normal rebalance
            } else {
              return (DecideStatus.TooSoon, newState); // too soon
            }
          } else {
            return (DecideStatus.NoNeedWithPending, newState); // when twapResult.percentageOfToken1 is less than 1%
          }
        }
      } else {
        // handle high volatility
        if (state != State.Special) {
          if (fastCurrentDiff >= thresholds.minorDeviation && twapResult.sameBlock) {
            return (DecideStatus.TooSoon, State.Special);
          }
        } else {
          // special -> noneed
          return (DecideStatus.NoNeed, State.Special);
        }
      }
      // high volatility, fastSlowDiff >= thresholds.majorDeviation
      state = State.Special;
      return (DecideStatus.Special, State.Special);
    } else {
      return (DecideStatus.ExtremeVolatility, State.Special);
    }
  }

  function _updateStatus(TwapResult memory twapResult) internal virtual returns (bool, State) {
    if (state != State.Special && lastRebalanceCurrentPrice != 0) {
      if (state != State.Normal) {
        if (state != State.OverInventory) {
          if (twapResult.percentageOfDepositToken <= thresholds.maxDepositRatio) {
            if (twapResult.percentageOfDepositToken >= thresholds.balancedStateMin) {
              return (true, State.Normal);
            }
          } else {
            return (true, State.OverInventory);
          }
        } else if (twapResult.percentageOfDepositToken >= thresholds.lowInventoryLevel) {
          if (twapResult.percentageOfDepositToken <= thresholds.highInventoryLevel) {
            return (true, State.Normal);
          }
        } else {
          return (true, State.UnderInventory);
        }

        uint256 priceChange = _calcPercentageDiff(lastRebalanceCurrentPrice, twapResult.currentPriceAccountingDecimals); // percentage diff between lastRebalanceCurrentPrice and currentPriceAccountingDecimals
        if (priceChange > thresholds.priceShiftTrigger) {
          return (true, state);
        }
      } else if (twapResult.percentageOfDepositToken <= thresholds.maxDepositRatio) {
        if (twapResult.percentageOfDepositToken < thresholds.lowInventoryLevel) {
          return (true, State.UnderInventory);
        }
      } else {
        return (true, State.OverInventory);
      }

      if (twapResult.percentageOfDepositTokenUnused <= thresholds.idleDepositRatio) {
        return (false, state); // no rebalance needed
      } else {
        return (true, state);
      }
    } else {
      if (twapResult.percentageOfDepositToken <= thresholds.maxDepositRatio) {
        if (twapResult.percentageOfDepositToken >= thresholds.lowInventoryLevel) {
          return (true, State.Normal);
        } else {
          return (true, State.UnderInventory);
        }
      } else {
        return (true, State.OverInventory);
      }
    }
  }

  function _getRangesWithState(State newState, TwapResult memory twapResult) internal view returns (Ranges memory ranges) {
    // scope to prevent stack too deep
    {
      bool _allowToken1 = allowToken1;
      int24 _tickSpacing = tickSpacing;
      uint8 _tokenDecimals = tokenDecimals;

      (uint256 upperPriceBound, uint256 targetPrice, uint256 lowerPriceBound) = _getPriceBounds(newState, twapResult, _allowToken1);
      int24 roundedTick = roundTickToTickSpacing(_tickSpacing, twapResult.currentTick);
      bool currentTickIsRound = roundedTick == twapResult.currentTick;

      int24 commonTick;
      int24 tickForLowerPrice;
      if (newState == State.Normal) {
        int24 targetTick = getTickAtPrice(_tokenDecimals, targetPrice);
        commonTick = roundTickToTickSpacingConsideringNegative(_tickSpacing, targetTick);
      } else {
        commonTick = roundTickToTickSpacingConsideringNegative(_tickSpacing, twapResult.currentTick);
      }

      int24 upperTick = getTickAtPrice(_tokenDecimals, upperPriceBound);
      int24 tickForHigherPrice = roundTickToTickSpacingConsideringNegative(_tickSpacing, upperTick);

      if (lowerPriceBound == 0) {
        int24 lowerTick = _allowToken1 ? TickMath.MIN_TICK : TickMath.MAX_TICK;
        tickForLowerPrice = (lowerTick / _tickSpacing) * _tickSpacing; // adjust to tick spacing
      } else {
        int24 lowerTick = getTickAtPrice(_tokenDecimals, lowerPriceBound);
        tickForLowerPrice = roundTickToTickSpacingConsideringNegative(_tickSpacing, lowerTick);
      }
      if (!_allowToken1) {
        ranges.baseLower = int24(commonTick);
        ranges.baseUpper = int24(tickForLowerPrice);
        ranges.limitLower = int24(tickForHigherPrice);
        ranges.limitUpper = int24(commonTick);

        if (newState != State.UnderInventory) {
          int24 roundedMinTick = roundTickToTickSpacing(_tickSpacing, TickMath.MIN_TICK);
          ranges.limitLower = int24(roundedMinTick); // use MIN tick
        } else {
          ranges.baseLower = currentTickIsRound ? twapResult.currentTick : ranges.baseLower;
          ranges.limitUpper = currentTickIsRound ? twapResult.currentTick - _tickSpacing : ranges.limitUpper;
        }

        if (newState == State.OverInventory) {
          ranges.limitUpper = currentTickIsRound ? twapResult.currentTick : _tickSpacing + ranges.limitUpper;
          ranges.baseLower = currentTickIsRound ? _tickSpacing + twapResult.currentTick : _tickSpacing + ranges.baseLower;
          ranges.baseUpper = int24(ranges.baseUpper + _tickSpacing);
        }
      } else {
        ranges.baseLower = int24(tickForLowerPrice);
        ranges.baseUpper = int24(commonTick);
        ranges.limitLower = int24(commonTick);
        ranges.limitUpper = int24(tickForHigherPrice);

        if (newState != State.UnderInventory) {
          ranges.limitUpper = roundTickToTickSpacing(_tickSpacing, TickMath.MAX_TICK);
        }

        if (lowerPriceBound > 0 && newState != State.OverInventory) {
          ranges.baseLower = int24(ranges.baseLower + _tickSpacing);
        }

        if (newState == State.Normal) {
          ranges.baseUpper = int24(_tickSpacing + ranges.baseUpper);
          ranges.limitLower = int24(_tickSpacing + ranges.limitLower);
        }

        if (newState == State.UnderInventory) {
          ranges.baseUpper = currentTickIsRound ? twapResult.currentTick : _tickSpacing + ranges.baseUpper;
          ranges.limitLower = currentTickIsRound ? _tickSpacing + twapResult.currentTick : _tickSpacing + ranges.limitLower;
        }

        if (newState == State.OverInventory) {
          ranges.baseUpper = currentTickIsRound ? twapResult.currentTick - _tickSpacing : ranges.baseUpper;
          ranges.limitLower = currentTickIsRound ? twapResult.currentTick : ranges.limitLower;
        }
      }
    }

    if (newState == State.OverInventory) {
      (ranges.baseLower, ranges.baseUpper, ranges.limitLower, ranges.limitUpper) = (
        ranges.limitLower,
        ranges.limitUpper,
        ranges.baseLower,
        ranges.baseUpper
      );
    }
  }

  function _getRangesWithoutState(TwapResult memory twapResult) internal view returns (Ranges memory ranges) {
    int24 _tickSpacing = tickSpacing;
    bool _allowToken1 = allowToken1;

    int24 tickRoundedDown = roundTickToTickSpacingConsideringNegative(_tickSpacing, twapResult.currentTick);
    int24 tickRounded = roundTickToTickSpacing(_tickSpacing, twapResult.currentTick);

    if (!_allowToken1) {
      if (twapResult.currentTick == tickRounded) {
        tickRoundedDown = twapResult.currentTick;
      }

      ranges.baseLower = tickRoundedDown;
      int24 maxTickRounded = roundTickToTickSpacing(_tickSpacing, TickMath.MAX_TICK); // round MaxUpperTick
      ranges.baseUpper = maxTickRounded;
      int24 minTickRounded = roundTickToTickSpacing(_tickSpacing, TickMath.MIN_TICK); // round MinLowerTick
      ranges.limitLower = minTickRounded;
      if (twapResult.currentTick == tickRounded) {
        tickRoundedDown = twapResult.currentTick - _tickSpacing;
      }
      ranges.limitUpper = tickRoundedDown;
    } else {
      int24 minTickRounded = roundTickToTickSpacing(_tickSpacing, TickMath.MIN_TICK);
      ranges.baseLower = minTickRounded;

      if (twapResult.currentTick == tickRounded) {
        ranges.baseUpper = twapResult.currentTick;
      } else {
        ranges.baseUpper = tickRoundedDown + _tickSpacing;
      }

      if (twapResult.currentTick == tickRounded) {
        ranges.limitLower = _tickSpacing + twapResult.currentTick;
      } else {
        ranges.limitLower = tickRoundedDown + _tickSpacing;
      }
      int24 maxTickRounded = roundTickToTickSpacing(_tickSpacing, TickMath.MAX_TICK); // round MaxUpperTick
      ranges.limitUpper = maxTickRounded;
    }
  }

  function _getPriceAccountingDecimals(
    address token0,
    address token1,
    uint128 _pairedTokenDecimals,
    int24 averageTick
  ) private pure returns (uint256 price) {
    uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(averageTick);
    if (uint160(sqrtPriceX96) > type(uint128).max) {
      uint256 priceX128 = FullMath.mulDiv(uint160(sqrtPriceX96), uint160(sqrtPriceX96), uint256(type(uint64).max) + 1);
      return
        token1 < token0
          ? FullMath.mulDiv(priceX128, _pairedTokenDecimals, uint256(type(uint128).max) + 1)
          : FullMath.mulDiv(uint256(type(uint128).max) + 1, _pairedTokenDecimals, priceX128);
    } else {
      return
        token1 < token0
          ? FullMath.mulDiv(uint256(sqrtPriceX96) * uint256(sqrtPriceX96), _pairedTokenDecimals, uint256(type(uint192).max) + 1)
          : FullMath.mulDiv(uint256(type(uint192).max) + 1, _pairedTokenDecimals, uint256(sqrtPriceX96) * uint256(sqrtPriceX96));
    }
  }

  function _authorize() internal view {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender));
  }

  function _getTwapPrices(
    address _depositToken,
    address _pairedToken,
    uint8 _pairedTokenDecimals,
    int24 slowTwapTick,
    int24 fastTwapTick,
    int24 currentTick
  ) internal view virtual returns (uint256, uint256, uint256) {
    return (
      _getPriceAccountingDecimals(_depositToken, _pairedToken, uint128(10 ** _pairedTokenDecimals), slowTwapTick),
      _getPriceAccountingDecimals(_depositToken, _pairedToken, uint128(10 ** _pairedTokenDecimals), fastTwapTick),
      _getPriceAccountingDecimals(_depositToken, _pairedToken, uint128(10 ** _pairedTokenDecimals), currentTick)
    );
  }

  function _getPairedTokenDecimals() internal view virtual returns (uint8) {
    return IERC20Metadata(pairedToken).decimals();
  }

  function _getDepositTokenDecimals() internal view virtual returns (uint8) {
    return IERC20Metadata(depositToken).decimals();
  }

  function _getDepositTokenVaultBalance() internal view virtual returns (uint256) {
    return IERC20Metadata(depositToken).balanceOf(vault);
  }

  function _calcPercentageDiff(uint256 a, uint256 b) private pure returns (uint256) {
    return b > a ? ((b - a) * 10000) / b : ((a - b) * 10000) / a;
  }

  function roundTickToTickSpacing(int24 _tickSpacing, int24 _tick) private pure returns (int24) {
    return (_tick / _tickSpacing) * _tickSpacing;
  }

  function roundTickToTickSpacingConsideringNegative(int24 _tickSpacing, int24 _tick) private pure returns (int24) {
    int24 roundedTick = roundTickToTickSpacing(_tickSpacing, _tick);
    if (_tick < 0) {
      return roundedTick - _tickSpacing;
    } else {
      return roundedTick;
    }
  }

  function _getPriceBounds(State _state, TwapResult memory twapResult, bool _allowToken1) private view returns (uint256, uint256, uint256) {
    uint256 targetPrice = twapResult.currentPriceAccountingDecimals;

    uint256 lowerPriceBound = 0;
    if (_state != State.UnderInventory) {
      lowerPriceBound = targetPrice - _calcPart(thresholds.baseRangeLower, targetPrice);
    }
    uint256 upperPriceBound = targetPrice + _calcPart(thresholds.baseRangeUpper, targetPrice);

    if (_state == State.Normal) {
      uint256 totalTokens = twapResult.totalDepositToken + twapResult.totalPairedInDeposit;
      uint256 partOfTotalTokens = _calcPart(totalTokens, thresholds.limitAllocation); // 5% of totalTokensInToken0
      uint256 excess = twapResult.totalPairedInDeposit - partOfTotalTokens;
      uint256 partOfExcess = excess * thresholds.baseRangeLower;
      uint256 excessCoef = partOfExcess / twapResult.totalDepositToken;
      if (excessCoef != 0) {
        targetPrice += _calcPart(excessCoef, targetPrice);
      }
    }

    if (!_allowToken1) {
      targetPrice = _removeDecimals(targetPrice, decimalsSum);
      lowerPriceBound = _removeDecimals(lowerPriceBound, decimalsSum);
      upperPriceBound = _removeDecimals(upperPriceBound, decimalsSum);
    }

    return (upperPriceBound, targetPrice, lowerPriceBound);
  }

  function _calcPart(uint256 base, uint256 part) private pure returns (uint256) {
    return (base * part) / 10000;
  }

  function _removeDecimals(uint256 amount, uint8 decimals) private pure returns (uint256) {
    return amount != 0 ? (10 ** decimals) / amount : amount;
  }

  function _pause() private {
    paused = true;
    emit Paused();
  }

  function getTickAtPrice(uint8 _tokenDecimals, uint256 _price) private pure returns (int24) {
    uint160 sqrtPriceX96 = getSqrtPriceX96(_tokenDecimals, _price);
    return TickMath.getTickAtSqrtRatio(sqrtPriceX96);
  }

  function getSqrtPriceX96(uint8 _tokenDecimals, uint256 _price) private pure returns (uint160) {
    return
      _price >= 10 ** _tokenDecimals
        ? getSqrtPriceX96FromPriceWithDecimals(_tokenDecimals, _price)
        : getSqrtPriceX96FromPriceWithoutDecimals(_tokenDecimals, _price);
  }

  function getSqrtPriceX96FromPriceWithDecimals(uint8 _tokenDecimals, uint256 _price) private pure returns (uint160) {
    return uint160((Math.sqrt(_price) << 96) / Math.sqrt(10 ** _tokenDecimals));
  }

  function getSqrtPriceX96FromPriceWithoutDecimals(uint8 _tokenDecimals, uint256 _price) private pure returns (uint160) {
    return uint160(Math.sqrt((_price << 192) / 10 ** _tokenDecimals));
  }

  function _validateThresholds(Thresholds memory _thresholds) internal pure {
    require(_thresholds.priceShiftTrigger < 10000, 'Invalid price shift trigger');
    require(_thresholds.lowInventoryLevel > 6000, '_lowInventoryLevel must be > 6000');
    require(_thresholds.balancedStateMin > _thresholds.lowInventoryLevel, '_balancedStateMin must be > _lowInventoryLevel');
    require(_thresholds.highInventoryLevel > _thresholds.balancedStateMin, '_highInventoryLevel must be > _balancedStateMin');
    require(_thresholds.maxDepositRatio > _thresholds.highInventoryLevel, '_maxDepositRatio must be > _highInventoryLevel');
    require(_thresholds.maxDepositRatio < 9500, '_maxDepositRatio must be < 9500');
    require(_thresholds.baseRangeLower >= 100 && _thresholds.baseRangeLower <= 10000, 'Invalid base range lower');
    require(_thresholds.baseRangeUpper >= 100 && _thresholds.baseRangeUpper <= 10000, 'Invalid base range upper');
    require(_thresholds.limitAllocation >= 100 && _thresholds.limitAllocation <= 10000 - _thresholds.maxDepositRatio, 'Invalid limit allocation');
    require(_thresholds.ratioBuffer <= 10000, '_ratioBuffer must be <= 10000');
    require(_thresholds.ratioBuffer < _thresholds.lowInventoryLevel, '_ratioBuffer must be < lowInventoryLevel');
    require(_thresholds.majorDeviation >= _thresholds.minorDeviation, '_majorDeviation must be >= minorDeviation');
    require(_thresholds.majorDeviation <= _thresholds.criticalDeviation, '_majorDeviation must be <= criticalDeviation');
    require(_thresholds.majorDeviation <= 10000, '_majorDeviation must be <= 10000');
    require(_thresholds.minorDeviation <= 300, '_minorDeviation must be <= 300');
    require(_thresholds.minorDeviation <= 10000, '_minorDeviation must be <= 10000');
    require(_thresholds.criticalDeviation >= _thresholds.majorDeviation, '_criticalDeviation must be >= majorDeviation');
    require(_thresholds.criticalDeviation <= 10000, '_criticalDeviation must be <= 10000');
    require(
      _thresholds.idleDepositRatio >= 100 && _thresholds.idleDepositRatio <= 10000,
      '_idleDepositRatio must be 100 <= _idleDepositRatio <= 10000'
    );
  }
}