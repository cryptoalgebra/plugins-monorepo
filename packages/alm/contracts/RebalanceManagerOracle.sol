// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './base/BaseRebalanceManagerOracle.sol';

contract RebalanceManagerOracle is BaseRebalanceManagerOracle {
  constructor(address _vault, address _manager, uint32 _minTimeBetweenRebalances, Thresholds memory _thresholds) {
    require(_vault != address(0), 'Invalid vault address');
    require(_manager != address(0), 'Invalid manager address');
    paused = false;
    vault = _vault;
    manager = _manager;
    pool = IAlgebraVault(vault).pool();
    factory = IAlgebraPool(pool).factory();

    tickSpacing = IAlgebraPool(pool).tickSpacing();

    bool _allowToken1 = IAlgebraVault(vault).allowToken1();

    minTimeBetweenRebalances = _minTimeBetweenRebalances;

    allowToken1 = _allowToken1;
    state = State.OverInventory;
    lastRebalanceTimestamp = 0;
    lastRebalanceCurrentPrice = 0;

    _validateThresholds(_thresholds);
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
}
