// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;
pragma abicoder v1;

import '@cryptoalgebra/integral-core/contracts/libraries/Constants.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolActions.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolPermissionedActions.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolErrors.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';

/// @title Mock of Algebra concentrated liquidity pool for plugins testing
/// @dev Shared test contract - import from @cryptoalgebra/test-utils
contract MockPool is IAlgebraPoolActions, IAlgebraPoolPermissionedActions, IAlgebraPoolState {
  struct GlobalState {
    uint160 price;
    int24 tick;
    uint16 fee;
    uint16 pluginConfig;
    uint16 communityFee;
    bool unlocked;
  }

  /// @dev Copy of TickManagement.Tick, which pins solc 0.8.20 and cannot be imported
  struct Tick {
    uint256 liquidityTotal;
    int128 liquidityDelta;
    int24 prevTick;
    int24 nextTick;
    uint256 outerFeeGrowth0Token;
    uint256 outerFeeGrowth1Token;
  }

  /// @inheritdoc IAlgebraPoolState
  uint256 public override totalFeeGrowth0Token;
  /// @inheritdoc IAlgebraPoolState
  uint256 public override totalFeeGrowth1Token;
  /// @inheritdoc IAlgebraPoolState
  GlobalState public override globalState;

  /// @inheritdoc IAlgebraPoolState
  int24 public override nextTickGlobal;
  /// @inheritdoc IAlgebraPoolState
  int24 public override prevTickGlobal;

  /// @inheritdoc IAlgebraPoolState
  uint128 public override liquidity;
  /// @inheritdoc IAlgebraPoolState
  int24 public override tickSpacing;
  /// @inheritdoc IAlgebraPoolState
  uint8 public override feeMode;

  /// @inheritdoc IAlgebraPoolState
  uint32 public override tickTreeRoot;
  /// @inheritdoc IAlgebraPoolState
  mapping(int16 => uint256) public override tickTreeSecondLayer;

  /// @inheritdoc IAlgebraPoolState
  address public override plugin;

  address public override communityVault;

  /// @inheritdoc IAlgebraPoolState
  mapping(int24 => Tick) public override ticks;

  /// @inheritdoc IAlgebraPoolState
  mapping(int16 => uint256) public override tickTable;

  struct Position {
    uint256 liquidity;
    uint256 innerFeeGrowth0Token;
    uint256 innerFeeGrowth1Token;
    uint128 fees0;
    uint128 fees1;
  }

  /// @inheritdoc IAlgebraPoolState
  mapping(bytes32 => Position) public override positions;

  address internal owner;
  /// @dev What the plugin returned on the last swap
  uint24 public overrideFee;
  uint256 public amountInDecrease;
  uint256 public amountInIncrease;
  uint256 public amountOutDecrease;

  /// @notice Optional token0/token1, settable for plugins that need pool currencies (e.g. permissioned-pool)
  address public token0;
  address public token1;

  function setTokens(address _token0, address _token1) external {
    token0 = _token0;
    token1 = _token1;
  }

  /// @inheritdoc IAlgebraPoolState
  function getCommunityFeePending() external pure override returns (uint128, uint128) {
    revert('not implemented');
  }

  /// @inheritdoc IAlgebraPoolState
  function safelyGetStateOfAMM() external pure override returns (uint160, int24, uint16, uint16, uint128, int24, int24) {
    revert('not implemented');
  }

  /// @inheritdoc IAlgebraPoolState
  /// @dev Mirrors AlgebraPoolBase: the plugin is asked only with DYNAMIC_FEE and not for its own swaps
  function getSwapFee(
    address sender,
    address recipient,
    bool zeroToOne,
    int256 amountRequired,
    uint160 limitSqrtPrice,
    bool withPaymentInAdvance,
    bytes calldata data
  ) external view override returns (uint24) {
    if (Plugins.hasFlag(globalState.pluginConfig, Plugins.DYNAMIC_FEE) && sender != plugin) {
      return
        IAlgebraDynamicFeePlugin(plugin).getSwapFee(
          sender,
          recipient,
          zeroToOne,
          amountRequired,
          limitSqrtPrice,
          withPaymentInAdvance,
          data
        );
    }
    return globalState.fee;
  }

  constructor() {
    globalState.fee = Constants.INIT_DEFAULT_FEE;
    globalState.unlocked = true;
    owner = msg.sender;
  }

  /// @inheritdoc IAlgebraPoolState
  function getReserves() external pure override returns (uint128, uint128) {
    revert('not implemented');
  }

  /// @inheritdoc IAlgebraPoolState
  function isUnlocked() external view override returns (bool unlocked) {
    return globalState.unlocked;
  }

  /// @inheritdoc IAlgebraPoolActions
  function initialize(uint160 initialPrice) external override {
    int24 tick = TickMath.getTickAtSqrtRatio(initialPrice);

    if (plugin != address(0)) {
      Plugins.shouldReturn(IAlgebraPlugin(plugin).beforeInitialize(msg.sender, initialPrice), IAlgebraPlugin.beforeInitialize.selector);
    }

    tickSpacing = 60;

    uint16 pluginConfig = globalState.pluginConfig;

    globalState.price = initialPrice;
    globalState.tick = tick;

    if (pluginConfig & Plugins.AFTER_INIT_FLAG != 0) {
      Plugins.shouldReturn(IAlgebraPlugin(plugin).afterInitialize(msg.sender, initialPrice, tick), IAlgebraPlugin.afterInitialize.selector);
    }
  }

  /// @dev Mirrors AlgebraPool: a pool operation started by the plugin itself skips the hooks
  function _isPlugin() internal view returns (bool) {
    return msg.sender == plugin;
  }

  /// @dev Mirrors AlgebraPool, which feeds every hook return value to Plugins.shouldReturn
  function _modifyPositionHooks(
    address positionOwner,
    int24 bottomTick,
    int24 topTick,
    int128 liquidityDelta,
    bytes calldata data
  ) internal {
    if (_isPlugin()) return;

    if (globalState.pluginConfig & Plugins.BEFORE_POSITION_MODIFY_FLAG != 0) {
      Plugins.shouldReturn(
        IAlgebraPlugin(plugin).beforeModifyPosition(msg.sender, positionOwner, bottomTick, topTick, liquidityDelta, data),
        IAlgebraPlugin.beforeModifyPosition.selector
      );
    }

    if (globalState.pluginConfig & Plugins.AFTER_POSITION_MODIFY_FLAG != 0) {
      Plugins.shouldReturn(
        IAlgebraPlugin(plugin).afterModifyPosition(msg.sender, positionOwner, bottomTick, topTick, liquidityDelta, 0, 0, data),
        IAlgebraPlugin.afterModifyPosition.selector
      );
    }
  }

  /// @inheritdoc IAlgebraPoolActions
  function mint(
    address,
    address recipient,
    int24 bottomTick,
    int24 topTick,
    uint128 liquidityDesired,
    bytes calldata data
  ) external override returns (uint256, uint256, uint128) {
    _modifyPositionHooks(recipient, bottomTick, topTick, int128(liquidityDesired), data);
    return (0, 0, 0);
  }

  /// @inheritdoc IAlgebraPoolActions
  function burn(
    int24 bottomTick,
    int24 topTick,
    uint128 liquidityDesired,
    bytes calldata data
  ) external override returns (uint256, uint256) {
    _modifyPositionHooks(msg.sender, bottomTick, topTick, -int128(liquidityDesired), data);
    return (0, 0);
  }

  /// @inheritdoc IAlgebraPoolActions
  function collect(address, int24, int24, uint128, uint128) external pure override returns (uint128, uint128) {
    revert('Not implemented');
  }

  /// @inheritdoc IAlgebraPoolActions
  function swap(address, bool, int256, uint160, bytes calldata) external pure override returns (int256, int256) {
    revert('Not implemented');
  }

  function swapToTick(int24 targetTick) external {
    _swapToTick(targetTick, true, 0);
  }

  /// @notice Same as swapToTick, but reports the swap direction the real pool would report
  /// @dev Not an overload, so existing swapToTick calls keep resolving
  function swapToTickWithDirection(int24 targetTick, bool zeroToOne) external {
    _swapToTick(targetTick, zeroToOne, 0);
  }

  /// @notice Same as swapToTickWithDirection, with the amountRequired the hooks get
  /// @dev Positive is exactIn, negative is exactOut. The mock computes no amounts, the hooks get zero amount0 and amount1
  function swapToTickWithAmount(int24 targetTick, bool zeroToOne, int256 amountRequired) external {
    _swapToTick(targetTick, zeroToOne, amountRequired);
  }

  /// @dev Checks the hook results as AlgebraPool does
  function _swapToTick(int24 targetTick, bool zeroToOne, int256 amountRequired) internal {
    IAlgebraPlugin _plugin = IAlgebraPlugin(plugin);
    uint16 pluginConfig = globalState.pluginConfig;
    bool fromPlugin = _isPlugin();

    if (Plugins.hasFlag(pluginConfig, Plugins.BEFORE_SWAP_FLAG) && !fromPlugin) {
      bytes4 selector;
      (amountInDecrease, selector, overrideFee) = _plugin.beforeSwap(msg.sender, msg.sender, zeroToOne, amountRequired, 0, false, '');
      if (Plugins.hasFlag(pluginConfig, Plugins.DYNAMIC_FEE)) {
        if (overrideFee >= Constants.FEE_DENOMINATOR) revert IAlgebraPoolErrors.invalidOverrideFee();
      } else if (overrideFee > 0) revert IAlgebraPoolErrors.dynamicFeeDisabled();
      if (amountInDecrease != 0) {
        if (!Plugins.hasFlag(pluginConfig, Plugins.AMOUNT_DELTAS_FLAG)) revert IAlgebraPoolErrors.amountDeltasDisabled();
        if (amountRequired < 0 || amountInDecrease >= uint256(amountRequired)) revert IAlgebraPoolErrors.invalidAmountInDecrease();
      }
      Plugins.shouldReturn(selector, IAlgebraPlugin.beforeSwap.selector);
    }

    globalState.price = TickMath.getSqrtRatioAtTick(targetTick);
    globalState.tick = targetTick;

    if (Plugins.hasFlag(pluginConfig, Plugins.AFTER_SWAP_CALCULATION_FLAG) && !fromPlugin) {
      bytes4 selector;
      (selector, amountInIncrease, amountOutDecrease) = _plugin.afterSwapCalculation(
        msg.sender,
        msg.sender,
        zeroToOne,
        amountRequired,
        0,
        0,
        0,
        ''
      );
      if ((amountInIncrease | amountOutDecrease) != 0 && !Plugins.hasFlag(pluginConfig, Plugins.AMOUNT_DELTAS_FLAG))
        revert IAlgebraPoolErrors.amountDeltasDisabled();
      if (amountInIncrease > 0 && (amountRequired > 0 || amountInIncrease > uint256(type(int256).max)))
        revert IAlgebraPoolErrors.invalidAmountInIncrease();
      // The mock output is zero, so any output delta exceeds it
      if (amountOutDecrease > 0) revert IAlgebraPoolErrors.invalidAmountOutDecrease();
      Plugins.shouldReturn(selector, IAlgebraPlugin.afterSwapCalculation.selector);
    }

    if (Plugins.hasFlag(globalState.pluginConfig, Plugins.AFTER_SWAP_FLAG) && !fromPlugin) {
      Plugins.shouldReturn(
        _plugin.afterSwap(msg.sender, msg.sender, zeroToOne, amountRequired, 0, 0, 0, 0, ''),
        IAlgebraPlugin.afterSwap.selector
      );
    }
  }

  /// @inheritdoc IAlgebraPoolActions
  function swapWithPaymentInAdvance(
    address,
    address,
    bool,
    int256,
    uint160,
    bytes calldata
  ) external pure override returns (int256, int256) {
    revert('Not implemented');
  }

  /// @inheritdoc IAlgebraPoolActions
  function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external override {
    uint16 pluginConfig = globalState.pluginConfig;
    if (pluginConfig & Plugins.BEFORE_FLASH_FLAG != 0) {
      Plugins.shouldReturn(
        IAlgebraPlugin(plugin).beforeFlash(msg.sender, recipient, amount0, amount1, data),
        IAlgebraPlugin.beforeFlash.selector
      );
    }

    if (pluginConfig & Plugins.AFTER_FLASH_FLAG != 0) {
      Plugins.shouldReturn(
        IAlgebraPlugin(plugin).afterFlash(msg.sender, recipient, amount0, amount1, 0, 0, data),
        IAlgebraPlugin.afterFlash.selector
      );
    }
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function setCommunityFee(uint16 newCommunityFee) external override {
    if (newCommunityFee > Constants.MAX_COMMUNITY_FEE || newCommunityFee == globalState.communityFee)
      revert IAlgebraPoolErrors.invalidNewCommunityFee();
    globalState.communityFee = newCommunityFee;
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function setFeeMode(uint8 newFeeMode) external override {
    if (newFeeMode > Constants.MAX_FEE_MODE || newFeeMode == feeMode) revert IAlgebraPoolErrors.invalidNewFeeMode();
    feeMode = newFeeMode;
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function setTickSpacing(int24 newTickSpacing) external override {
    if (newTickSpacing <= 0 || newTickSpacing > Constants.MAX_TICK_SPACING || tickSpacing == newTickSpacing)
      revert IAlgebraPoolErrors.invalidNewTickSpacing();
    tickSpacing = newTickSpacing;
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function setPlugin(address newPluginAddress) external override {
    // solhint-disable-next-line reason-string
    require(msg.sender == owner);
    plugin = newPluginAddress;
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function setPluginConfig(uint16 newConfig) external override {
    // The real pool refuses a config change while no plugin is connected
    if (plugin == address(0)) revert IAlgebraPoolErrors.pluginIsNotConnected();
    // solhint-disable-next-line reason-string
    require(msg.sender == owner || msg.sender == plugin);
    // The flag dependencies the real pool enforces
    if (Plugins.hasFlag(newConfig, Plugins.DYNAMIC_FEE) && !Plugins.hasFlag(newConfig, Plugins.BEFORE_SWAP_FLAG))
      revert IAlgebraPoolErrors.invalidNewPluginConfig();
    if (
      Plugins.hasFlag(newConfig, Plugins.AMOUNT_DELTAS_FLAG) &&
      !Plugins.hasFlag(newConfig, Plugins.BEFORE_SWAP_FLAG | Plugins.AFTER_SWAP_CALCULATION_FLAG)
    ) revert IAlgebraPoolErrors.invalidNewPluginConfig();
    globalState.pluginConfig = newConfig;
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function setFee(uint16 newFee) external override {
    // solhint-disable-next-line reason-string
    require(msg.sender == owner || msg.sender == plugin);
    bool isDynamicFeeEnabled = Plugins.hasFlag(globalState.pluginConfig, Plugins.DYNAMIC_FEE);
    // solhint-disable-next-line reason-string
    require(!isDynamicFeeEnabled && msg.sender == owner);

    globalState.fee = newFee;
  }

  function setCommunityVault(address newCommunityVault) external override {
    communityVault = newCommunityVault;
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function sync() external pure override {
    revert('Not implemented');
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function skim() external pure override {
    revert('Not implemented');
  }

  /// @inheritdoc IAlgebraPoolPermissionedActions
  function claimCommunityFee() external pure override returns (uint128, uint128) {
    revert('Not implemented');
  }
}
