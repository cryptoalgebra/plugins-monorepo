// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import '@cryptoalgebra/integral-core/contracts/base/common/Timestamp.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/SafeTransfer.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import './interfaces/IAbstractPlugin.sol';
import './interfaces/IAlgebraPluginProxy.sol';

/// @title Algebra Integral 1.2.2 Upgradeable Abstract Plugin
/// @notice Base contract for upgradeable plugins using Beacon Proxy pattern
abstract contract UpgradeableAbstractPlugin is Initializable, IAbstractPlugin, Timestamp {
  using Plugins for uint8;

  /// @dev Offset in AlgebraPluginProxy bytecode
  uint256 public constant POOL_ADDRESS_OFFSET = 75;
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  /// @dev shared across all proxies
  address public immutable factory;

  /// @dev shared across all proxies
  address public immutable pluginFactory;

  modifier onlyPool() {
    _checkIfFromPool();
    _;
  }

  modifier onlyPluginFactory() {
    if (msg.sender != pluginFactory) revert OnlyPluginFactory();
    _;
  }

  constructor(address _factory, address _pluginFactory) {
    factory = _factory;
    pluginFactory = _pluginFactory;
    _disableInitializers();
  }

  /// @dev Reads the pool address embedded in the proxy's bytecode.
  function _getPool() internal view virtual returns (address) {
    bytes32 word;
    assembly {
      let ptr := mload(0x40)
      extcodecopy(address(), ptr, POOL_ADDRESS_OFFSET, 32)
      word := mload(ptr)
    }
    return address(uint160(uint256(word)));
  }

  function _checkIfFromPool() internal view {
    if (msg.sender != _getPool()) revert OnlyPool();
  }

  function _authorize() internal view virtual {
    if (!IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender)) revert OnlyAdministrator();
  }

  function _getPoolState() internal view virtual returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig) {
    (price, tick, fee, pluginConfig, , ) = IAlgebraPoolState(_getPool()).globalState();
  }

  function _getPluginInPool() internal view returns (address plugin) {
    return IAlgebraPool(_getPool()).plugin();
  }

  function pool() public view returns (address) {
    return _getPool();
  }

  /// @inheritdoc IAbstractPlugin
  /// @dev must be implemented by the default plugin
  function getActiveModuleNames() external view virtual override returns (string[] memory moduleNames);

  /// @notice Returns the default plugin config
  /// @dev Must be implemented by the default plugin, used to sync config into the pool
  function defaultPluginConfig() public view virtual returns (uint8);

  /// @inheritdoc IAbstractPlugin
  function collectPluginFee(address token, uint256 amount, address recipient) external virtual override {
    _authorize();
    SafeTransfer.safeTransfer(token, recipient, amount);
  }

  /// @inheritdoc IAlgebraPlugin
  function handlePluginFee(uint256, uint256) external view virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.handlePluginFee.selector;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeModifyPosition(
    address,
    address,
    int24,
    int24,
    int128,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4, uint24) {
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  function afterModifyPosition(
    address,
    address,
    int24,
    int24,
    int128,
    uint256,
    uint256,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4, uint24, uint24) {
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function afterSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    int256,
    int256,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterSwap.selector;
  }

  function beforeFlash(address, address, uint256, uint256, bytes calldata) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.beforeFlash.selector;
  }

  function afterFlash(
    address,
    address,
    uint256,
    uint256,
    uint256,
    uint256,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterFlash.selector;
  }

  function _updatePluginConfigInPool(uint8 newPluginConfig) internal {
    (, , , uint8 currentPluginConfig) = _getPoolState();
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(_getPool()).setPluginConfig(newPluginConfig);
    }
  }
}
