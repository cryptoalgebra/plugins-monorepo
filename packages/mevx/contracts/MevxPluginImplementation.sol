// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IMevxExecutor.sol';
import './interfaces/IMevxPluginImplementation.sol';
import './interfaces/IMevxRouter.sol';
import './interfaces/IProfitDistributor.sol';
import './libraries/MevxStorage.sol';

/// @title MEVX Plugin Implementation
/// @notice This contract contains MEVX plugin logic using namespaced storage
/// @dev Executed via delegatecall from MevxConnector
contract MevxPluginImplementation is IMevxPluginImplementation {

  uint16 internal constant ALGEBRA_POOL_TYPE = 2;

  function initializeMevx(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    layout.mevxRouter = mevxRouter;
    layout.mevxExecutor = mevxExecutor;
    layout.mevxProfitDistributor = profitDistributor;
    layout.mevxConfigId = configId;
  }

  function initializePool(address pool, uint160 sqrtPriceX96) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    address router = layout.mevxRouter;
    if (router == address(0)) return;

    bytes32 poolId = bytes32(uint256(uint160(pool)));
    bytes memory data = abi.encode(sqrtPriceX96);

    // Failsafe: keep pool initialization non-blocking for the main flow.
    try IMevxRouter(router).initializePool(poolId, ALGEBRA_POOL_TYPE, data) {} catch {}
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

  function mevxAfterSwap(
    address pool,
    bool zeroToOne,
    int256 amount0,
    int256 amount1,
    address recipient
  ) external {
    MevxStorage.Layout storage layout = MevxStorage.layout();

    bytes32 poolId = bytes32(uint256(uint160(pool)));

    bytes memory callData = abi.encodeWithSelector(
        IMevxRouter.constructArbitrageRoute.selector,
        poolId,
        zeroToOne,
        amount0,
        amount1
    );

    (bool success, bytes memory returnData) = address(layout.mevxRouter).call(
        callData
    );

    bool isArbPossible;
    address profitToken;
    address[] memory pools;
    uint256 amountIn;
    bytes memory encodedRoute;

    if (success && returnData.length > 0) {
        (isArbPossible, profitToken, pools, amountIn, encodedRoute) = abi
            .decode(returnData, (bool, address, address[], uint256, bytes));
    }

    if (isArbPossible) {
        try
            IMevxExecutor(layout.mevxExecutor).executeRoute(
                encodedRoute,
                pools,
                amountIn,
                address(layout.mevxProfitDistributor)
            )
        {
            try
                IProfitDistributor(layout.mevxProfitDistributor).distributeProfit(
                    layout.mevxConfigId,
                    profitToken,
                    recipient
                )
            {} catch {}
        } catch {}
    }
  }
}
