// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4;

import {IAlgebraVault} from '@cryptoalgebra/alm-vault/contracts/interfaces/IAlgebraVault.sol';
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IAlgebraPool} from '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';

import 'hardhat/console.sol';

contract MockVault is IAlgebraVault, ERC20 {
  event MockRebalance(int24 baseLower, int24 baseUpper, int24 limitLower, int24 limitUpper);

  address public immutable algebraVaultFactory;
  address public immutable override pool;
  address public immutable override token0;
  address public immutable override token1;
  bool public override allowToken0;
  bool public override allowToken1;

  address public override ammFeeRecipient;
  address public override affiliate;

  // Position tracking
  uint256 public basePositionId;
  uint256 public limitPositionId;

  uint256 public override deposit0Max;
  uint256 public override deposit1Max;
  uint256 public override hysteresis;

  uint256 public constant PRECISION = 10 ** 18;
  uint256 constant PERCENT = 100;
  address constant NULL_ADDRESS = address(0);
  uint256 constant MIN_SHARES = 1000;

  uint32 public twapPeriod;
  uint32 public auxTwapPeriod;

  uint24 public fee;
  int24 public tickSpacing;

  int24 public override baseLower;
  int24 public override baseUpper;
  int24 public override limitLower;
  int24 public override limitUpper;

  uint256 public totalAmount0;
  uint256 public totalAmount1;

  constructor(
    address _pool,
    bool _allowToken0,
    bool _allowToken1
  )
    // address __owner,
    // uint32 _twapPeriod,
    // uint256 _vaultIndex
    ERC20('TestLP', 'TestLP')
  {
    // require(_pool != NULL_ADDRESS, "IV.constructor: zero address");
    // require((_allowToken0 && !_allowToken1) ||
    //         (_allowToken1 && !_allowToken0), "IV.constructor: must be single sided");

    algebraVaultFactory = msg.sender;
    // pool = _pool;
    // token0 = IAlgebraPool(_pool).token0();
    // token1 = IAlgebraPool(_pool).token1();
    pool = _pool;
    token0 = address(0);
    token1 = address(0);
    allowToken0 = _allowToken0;
    allowToken1 = _allowToken1;
    // twapPeriod = _twapPeriod;
    // auxTwapPeriod = _twapPeriod / 4; // default value is a quarter of the TWAP period

    // hysteresis = PRECISION / PERCENT / 2; // 0.5% threshold
    // deposit0Max = type(uint256).max; // max uint256
    // deposit1Max = type(uint256).max; // max uint256
    // ammFeeRecipient = NULL_ADDRESS; // by default there is no amm fee recipient address;
    // affiliate = NULL_ADDRESS; // by default there is no affiliate address
  }

  function setAllowTokens(bool _allowToken0, bool _allowToken1) public {
    (allowToken0, allowToken1) = (_allowToken0, _allowToken1);
  }

  function getTotalAmounts() external view returns (uint256, uint256) {
    return (totalAmount0, totalAmount1);
  }

  function deposit(uint256, uint256, address) external returns (uint256) {}

  function withdraw(uint256, address) external returns (uint256, uint256) {}

  function rebalance(int24 _baseLower, int24 _baseUpper, int24 _limitLower, int24 _limitUpper, int256 swapQuantity) external {
    console.log('VAULT REBALANCE CALLED');
    console.logInt(_baseLower);
    console.logInt(_baseUpper);
    console.logInt(_limitLower);
    console.logInt(_limitUpper);
    emit MockRebalance(_baseLower, _baseUpper, _limitLower, _limitUpper);
  }

  function resetAllowances() external {}

  function setHysteresis(uint256 _hysteresis) external {}

  function collectFees() external returns (uint256 fees0, uint256 fees1) {}

  function setDepositMax(uint256 _deposit0Max, uint256 _deposit1Max) external {}

  function setAmmFeeRecipient(address _ammFeeRecipient) external {}

  function setAffiliate(address _affiliate) external {}

  function _position(int24 tickLower, int24 tickUpper) internal view returns (uint128 liquidity, uint128 tokensOwed0, uint128 tokensOwed1) {
    bytes32 positionKey;
    address owner = address(this);
    assembly {
      positionKey := or(shl(24, or(shl(24, owner), and(tickLower, 0xFFFFFF))), and(tickUpper, 0xFFFFFF))
    }

    (uint256 _liquidity, , , uint128 _tokensOwed0, uint128 _tokensOwed1) = IAlgebraPool(pool).positions(positionKey);
    liquidity = uint128(_liquidity);
    tokensOwed0 = _tokensOwed0;
    tokensOwed1 = _tokensOwed1;
  }

  function currentTick() public view returns (int24 tick) {
    (, int24 tick_, , , , bool unlocked_) = IAlgebraPool(pool).globalState();
    require(unlocked_, 'IV.currentTick: the pool is locked');
    tick = tick_;
  }

  function setTotalAmounts(uint256 _totalAmount0, uint256 _totalAmount1) public {
    (totalAmount0, totalAmount1) = (_totalAmount0, _totalAmount1);
  }

  function getBasePosition() public view returns (uint128, uint256, uint256) {
    return (0, 0, 0);
  }

  function getLimitPosition() public view returns (uint128, uint256, uint256) {
    return (0, 0, 0);
  }
}
