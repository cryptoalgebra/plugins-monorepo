// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IMevxExecutor.sol';
import './interfaces/IMevxPluginImplementation.sol';
import './interfaces/IMevxRouter.sol';
import './interfaces/IProfitDistributor.sol';
import './libraries/MevxStorage.sol';

/// @title MEVX Plugin Implementation
/// @notice This contract contains MEVX plugin logic using namespaced storage
/// @dev Executed via delegatecall from MevxConnector
contract MevxPluginImplementation is IMevxPluginImplementation {
  using SafeERC20 for IERC20;

  uint16 internal constant ALGEBRA_POOL_TYPE = 3;
  uint256 public constant MAX_MIN_GAS_LEFT = 2_500_000;
  uint256 public constant MAX_CALL_GAS_BUDGET = 5_000_000;

  function initializeMevx(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    layout.mevxRouter = mevxRouter;
    layout.mevxExecutor = mevxExecutor;
    layout.mevxProfitDistributor = profitDistributor;
    layout.mevxConfigId = configId;
    layout.callGasBudget = MAX_CALL_GAS_BUDGET;
  }

  function initializePool(address pool, uint160 sqrtPriceX96) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    address router = layout.mevxRouter;
    if (router == address(0)) return;

    bytes32 poolId = bytes32(uint256(uint160(pool)));
    bytes memory data = abi.encode(sqrtPriceX96);

    bytes memory initData = abi.encodeCall(IMevxRouter.initializePoolExternally, (poolId, ALGEBRA_POOL_TYPE, data));

    // Failsafe: keep pool initialization non-blocking for the main flow.
    address(router).call{gas: layout.callGasBudget}(initData);
  }

  function setConfigId(bytes32 configId) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    bytes32 oldConfigId = layout.mevxConfigId;
    layout.mevxConfigId = configId;
    emit ConfigIdSet(oldConfigId, configId);
  }

  function setProfitDistributor(address profitDistributor) external {
    require(profitDistributor != address(0), 'Invalid distributor');
    MevxStorage.Layout storage layout = MevxStorage.layout();
    address oldProfitDistributor = layout.mevxProfitDistributor;
    layout.mevxProfitDistributor = profitDistributor;
    emit ProfitDistributorSet(oldProfitDistributor, profitDistributor);
  }

  function setMevxExecutor(address mevxExecutor) external {
    require(mevxExecutor != address(0), 'Invalid executor');
    MevxStorage.Layout storage layout = MevxStorage.layout();
    address oldMevxExecutor = layout.mevxExecutor;
    layout.mevxExecutor = mevxExecutor;
    emit MevxExecutorSet(oldMevxExecutor, mevxExecutor);
  }

  function setMevxRouter(address mevxRouter) external {
    require(mevxRouter != address(0), 'Invalid router');
    MevxStorage.Layout storage layout = MevxStorage.layout();
    address oldMevxRouter = layout.mevxRouter;
    layout.mevxRouter = mevxRouter;
    emit MevxRouterSet(oldMevxRouter, mevxRouter);
  }

  function setMinGasLeft(uint256 minGasLeft) external {
    require(minGasLeft <= MAX_MIN_GAS_LEFT, 'minGasLeft too high');
    MevxStorage.Layout storage layout = MevxStorage.layout();
    uint256 oldMinGasLeft = layout.minGasLeft;
    layout.minGasLeft = minGasLeft;
    emit MinGasLeftSet(oldMinGasLeft, minGasLeft);
  }

  function setCallGasBudget(uint256 callGasBudget) external {
    require(callGasBudget <= MAX_CALL_GAS_BUDGET, 'callGasBudget too high');
    MevxStorage.Layout storage layout = MevxStorage.layout();
    uint256 oldCallGasBudget = layout.callGasBudget;
    layout.callGasBudget = callGasBudget;
    emit CallGasBudgetSet(oldCallGasBudget, callGasBudget);
  }

  function setMevProtectionFeeEnabled(bool enabled) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    bool oldEnabled = layout.mevProtectionFeeEnabled;
    layout.mevProtectionFeeEnabled = enabled;
    emit MevProtectionFeeEnabledSet(oldEnabled, enabled);
  }

  function setAuthorizedHandlePluginFeeCaller(address caller, bool authorized) external {
    require(caller != address(0), 'Invalid caller');
    MevxStorage.Layout storage layout = MevxStorage.layout();
    layout.authorizedHandlePluginFeeCallers[caller] = authorized;
    emit AuthorizedHandlePluginFeeCallerSet(caller, authorized);
  }

  /// @notice Distributes collected plugin fees to the profit distributor
  /// @dev Called via delegatecall from MevxConnector.handlePluginFee; address(this) is the proxy
  function handlePluginFee(address pool, uint256 pluginFee0, uint256 pluginFee1) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    address recipient = layout.mevxProfitDistributor;
    if (recipient == address(0)) return;

    bytes32 configId = layout.mevxConfigId;
    address token0 = IAlgebraPool(pool).token0();
    address token1 = IAlgebraPool(pool).token1();

    if (pluginFee0 > 0) {
      IERC20(token0).safeTransfer(recipient, pluginFee0);
      try IProfitDistributor(recipient).distributeProfit(configId, token0, address(0)) {} catch {}
    }
    if (pluginFee1 > 0) {
      IERC20(token1).safeTransfer(recipient, pluginFee1);
      try IProfitDistributor(recipient).distributeProfit(configId, token1, address(0)) {} catch {}
    }
  }

  function mevxAfterSwap(
    address pool,
    address sender,
    address recipient,
    bool zeroToOne,
    int256 amount0,
    int256 amount1
  ) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();

    if (sender != layout.mevxExecutor) {
      require(gasleft() >= layout.minGasLeft, 'Insufficient gas for afterSwap hook');
    }

    bytes memory branchData = abi.encodeCall(
      IMevxPluginImplementation.runArbitrage,
      (bytes32(uint256(uint160(pool))), zeroToOne, amount0, amount1, sender, recipient)
    );

    address(this).call{gas: layout.callGasBudget}(branchData);
  }

  function runArbitrage(
    bytes32 poolId,
    bool zeroToOne,
    int256 amount0,
    int256 amount1,
    address sender,
    address recipient
  ) external {
    require(msg.sender == address(this), 'self only');

    bytes memory initialArbCheckCallData = abi.encodeWithSelector(
      IMevxRouter.initialArbCheck.selector,
      poolId,
      !zeroToOne
    );

    MevxStorage.Layout storage layout = MevxStorage.layout();

    (bool successInitialArbCheck, bytes memory returnDataInitialArbCheck) = address(layout.mevxRouter).call(
      initialArbCheckCallData
    );

    if (sender == layout.mevxExecutor) {
      return;
    }

    if (!successInitialArbCheck || returnDataInitialArbCheck.length != 64) {
      return;
    }

    (bool isArbPossible, bytes16 arbData) = abi.decode(returnDataInitialArbCheck, (bool, bytes16));

    if (!isArbPossible) {
      return;
    }

    bytes memory callData = abi.encodeWithSelector(
        IMevxRouter.constructArbitrageRoute.selector,
        poolId,
        zeroToOne,
        arbData,
        amount0,
        amount1
    );

    (bool success, bytes memory returnData) = address(layout.mevxRouter).call(callData);

    address profitToken;
    address[] memory pools;
    uint256 amountIn;
    bytes memory encodedRoute;

    if (success && returnData.length >= 224) {
        (isArbPossible, profitToken, pools, amountIn, encodedRoute) = abi
            .decode(returnData, (bool, address, address[], uint256, bytes));
    }
    
    //add variables to avoid stack too deep error
    address _recipient = recipient; 
    address _mevxProfitDistributor = layout.mevxProfitDistributor;
    if (isArbPossible) {
        try
            IMevxExecutor(layout.mevxExecutor).executeRoute(
                encodedRoute,
                pools,
                amountIn,
                profitToken,
                address(_mevxProfitDistributor)
            )
        {
            try
                IProfitDistributor(_mevxProfitDistributor).distributeProfit(
                    layout.mevxConfigId,
                    profitToken,
                    _recipient
                )
            {} catch {}
        } catch {}
    }
  }
}
