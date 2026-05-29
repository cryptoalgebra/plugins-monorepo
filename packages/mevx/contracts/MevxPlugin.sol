// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Constants.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import './interfaces/IMevxExecutor.sol';
import './interfaces/IMevxRouter.sol';
import './interfaces/IProfitDistributor.sol';

/// @title MEV-X plugin module
/// @notice Integrates MEV-X arbitrage and optional MEV protection fee with Algebra Integral v1.0 plugins.
abstract contract MevxPlugin is BaseAbstractPlugin {
  using Plugins for uint8;

  uint16 internal constant ALGEBRA_INTEGRAL_POOL_TYPE = 3;

  uint256 public constant MAX_MIN_GAS_LEFT = 2_500_000;
  uint256 public constant MAX_CALL_GAS_BUDGET = 5_000_000;

  struct MevxConfig {
    address mevxRouter;
    address mevxExecutor;
    address profitDistributor;
    bytes32 configId;
    bool mevProtectionFeeEnabled;
  }

  IProfitDistributor public profitDistributor;
  IMevxExecutor public mevxExecutor;
  IMevxRouter public mevxRouter;
  bytes32 public mevxConfigId;

  bool public mevProtectionFeeEnabled;

  uint256 public minGasLeft;
  uint256 public callGasBudget;

  event MevxConfigIdSet(bytes32 oldConfigId, bytes32 newConfigId);
  event ProfitDistributorSet(address oldProfitDistributor, address newProfitDistributor);
  event MevxExecutorSet(address oldMevxExecutor, address newMevxExecutor);
  event MevxRouterSet(address oldMevxRouter, address newMevxRouter);
  event MinGasLeftSet(uint256 oldMinGasLeft, uint256 newMinGasLeft);
  event CallGasBudgetSet(uint256 oldCallGasBudget, uint256 newCallGasBudget);
  event MevProtectionFeeEnabledSet(bool oldEnabled, bool newEnabled);

  constructor(MevxConfig memory _mevxConfig) {
    defaultPluginConfig =
      defaultPluginConfig |
      uint8(Plugins.AFTER_INIT_FLAG | Plugins.AFTER_SWAP_FLAG | Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

    mevxRouter = IMevxRouter(_mevxConfig.mevxRouter);
    mevxExecutor = IMevxExecutor(_mevxConfig.mevxExecutor);
    profitDistributor = IProfitDistributor(_mevxConfig.profitDistributor);
    mevxConfigId = _mevxConfig.configId;
    mevProtectionFeeEnabled = _mevxConfig.mevProtectionFeeEnabled;
    callGasBudget = MAX_CALL_GAS_BUDGET;

    activeModules.push('MEV-X Plugin');
  }

  function setMevxConfigId(bytes32 _configId) external {
    _authorize();
    bytes32 oldConfigId = mevxConfigId;
    mevxConfigId = _configId;
    emit MevxConfigIdSet(oldConfigId, _configId);
  }

  function setProfitDistributor(IProfitDistributor _profitDistributor) external {
    _authorize();
    require(address(_profitDistributor) != address(0), 'profitDistributor is zero address');

    address oldProfitDistributor = address(profitDistributor);
    profitDistributor = _profitDistributor;
    emit ProfitDistributorSet(oldProfitDistributor, address(_profitDistributor));
  }

  function setMevxExecutor(IMevxExecutor _mevxExecutor) external {
    _authorize();
    require(address(_mevxExecutor) != address(0), 'mevxExecutor is zero address');

    address oldMevxExecutor = address(mevxExecutor);
    mevxExecutor = _mevxExecutor;
    emit MevxExecutorSet(oldMevxExecutor, address(_mevxExecutor));
  }

  function setMevxRouter(IMevxRouter _mevxRouter) external {
    _authorize();
    require(address(_mevxRouter) != address(0), 'mevxRouter is zero address');

    address oldMevxRouter = address(mevxRouter);
    mevxRouter = _mevxRouter;
    emit MevxRouterSet(oldMevxRouter, address(_mevxRouter));
  }

  function setMinGasLeft(uint256 minGasLeft_) external {
    _authorize();
    require(minGasLeft_ <= MAX_MIN_GAS_LEFT, 'minGasLeft too high');
    uint256 oldMinGasLeft = minGasLeft;
    minGasLeft = minGasLeft_;
    emit MinGasLeftSet(oldMinGasLeft, minGasLeft_);
  }

  function setCallGasBudget(uint256 callGasBudget_) external {
    _authorize();
    require(callGasBudget_ <= MAX_CALL_GAS_BUDGET, 'callGasBudget too high');
    uint256 oldCallGasBudget = callGasBudget;
    callGasBudget = callGasBudget_;
    emit CallGasBudgetSet(oldCallGasBudget, callGasBudget_);
  }

  function setMevProtectionFeeEnabled(bool enabled) external {
    _authorize();
    bool oldEnabled = mevProtectionFeeEnabled;
    mevProtectionFeeEnabled = enabled;
    emit MevProtectionFeeEnabledSet(oldEnabled, enabled);
  }

  function _initializeMevxPool(address pool, uint160 sqrtPriceX96) internal {
    bytes32 poolId = bytes32(uint256(uint160(pool)));
    bytes memory initData = abi.encodeCall(IMevxRouter.initializePoolExternally, (poolId, ALGEBRA_INTEGRAL_POOL_TYPE, abi.encode(sqrtPriceX96)));

    (bool success, ) = address(mevxRouter).call{gas: callGasBudget}(initData);
    if (!success) return;
  }

  function _runMevxAfterSwap(address pool, address sender, bool zeroToOne, int256 amount0, int256 amount1) internal {
    IMevxExecutor executor = mevxExecutor;

    if (sender != address(executor)) {
      require(gasleft() >= minGasLeft, 'Insufficient gas for afterSwap hook');
    }

    bytes32 poolId = bytes32(uint256(uint160(pool)));
    bytes memory branchData = abi.encodeCall(this.runArbitrage, (poolId, zeroToOne, amount0, amount1, sender));

    (bool success, ) = address(this).call{gas: callGasBudget}(branchData);
    if (!success) return;
  }

  function runArbitrage(bytes32 poolId, bool zeroToOne, int256 amount0, int256 amount1, address sender) external {
    require(msg.sender == address(this), 'self only');

    IMevxRouter router = mevxRouter;
    IMevxExecutor executor = mevxExecutor;

    (bool successInitialArbCheck, bytes memory returnDataInitialArbCheck) = address(router).call(
      abi.encodeWithSelector(IMevxRouter.initialArbCheck.selector, poolId, !zeroToOne)
    );

    if (sender == address(executor)) return;
    if (!successInitialArbCheck || returnDataInitialArbCheck.length != 64) return;

    (bool isArbPossible, bytes16 arbData) = abi.decode(returnDataInitialArbCheck, (bool, bytes16));
    if (!isArbPossible) return;

    (bool success, bytes memory returnData) = address(router).call(
      abi.encodeWithSelector(IMevxRouter.constructArbitrageRoute.selector, poolId, zeroToOne, arbData, amount0, amount1)
    );

    address profitToken;
    address[] memory pools;
    uint256 amountIn;
    bytes memory encodedRoute;

    if (success && returnData.length >= 224) {
      (isArbPossible, profitToken, pools, amountIn, encodedRoute) = abi.decode(returnData, (bool, address, address[], uint256, bytes));
    }

    IProfitDistributor distributor = profitDistributor;

    if (isArbPossible) {
      try executor.executeRoute(encodedRoute, pools, amountIn, profitToken, address(distributor)) {
        try distributor.distributeProfit(mevxConfigId, profitToken) {} catch {}
      } catch {}
    }
  }

  function _getFeeWithMevProtection(address sender, uint16 currentFee) internal view returns (uint16) {
    IMevxExecutor executor = mevxExecutor;
    if (sender == address(executor) && address(executor) != address(0)) return 1;
    if (!mevProtectionFeeEnabled) return currentFee;

    return _getFeeWithMevProtection(currentFee);
  }

  function _getFeeWithMevProtection(uint16 currentFee) internal view returns (uint16) {
    IMevxRouter router = mevxRouter;
    if (address(router) == address(0)) return currentFee;

    (bool success, bytes memory returnData) = address(router).staticcall{gas: callGasBudget}(
      abi.encodeWithSelector(IMevxRouter.getMevProtectionFee.selector, currentFee)
    );

    if (!success || returnData.length != 32) return currentFee;

    uint24 mevProtectionFee = abi.decode(returnData, (uint24));
    if (mevProtectionFee > Constants.MAX_DEFAULT_FEE) return currentFee;
    if (uint256(currentFee) + mevProtectionFee > Constants.MAX_DEFAULT_FEE) return currentFee;

    return currentFee + uint16(mevProtectionFee);
  }
}
