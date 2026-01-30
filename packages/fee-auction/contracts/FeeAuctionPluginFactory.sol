// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IFeeAuctionPluginFactory.sol';
import './FeeAuctionPlugin.sol';

/// @title Fee Auction Plugin Factory
/// @notice Factory for creating FeeAuctionPlugin instances for Algebra pools
contract FeeAuctionPluginFactory is IFeeAuctionPluginFactory {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  /// @inheritdoc IFeeAuctionPluginFactory
  uint24 public override defaultBaseFee;

  /// @inheritdoc IFeeAuctionPluginFactory
  uint24 public override defaultMevTaxMultiplier;

  /// @inheritdoc IFeeAuctionPluginFactory
  uint24 public override defaultMaxMevTax;

  /// @inheritdoc IFeeAuctionPluginFactory
  bool public override defaultMevTaxEnabled;

  /// @inheritdoc IBasePluginFactory
  mapping(address => address) public override pluginByPool;

  /// @notice Restricts access to factory administrator
  modifier onlyAdministrator() {
    require(
      IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR, msg.sender),
      'Only administrator'
    );
    _;
  }

  /// @notice Creates a new FeeAuctionPluginFactory
  /// @param _algebraFactory The Algebra factory address
  /// @param _defaultBaseFee The default base fee for new plugins
  /// @param _defaultMevTaxMultiplier The default MEV tax multiplier for new plugins
  /// @param _defaultMaxMevTax The default max MEV tax for new plugins
  /// @param _defaultMevTaxEnabled Whether MEV tax is enabled by default
  constructor(
    address _algebraFactory,
    uint24 _defaultBaseFee,
    uint24 _defaultMevTaxMultiplier,
    uint24 _defaultMaxMevTax,
    bool _defaultMevTaxEnabled
  ) {
    algebraFactory = _algebraFactory;
    defaultBaseFee = _defaultBaseFee;
    defaultMevTaxMultiplier = _defaultMevTaxMultiplier;
    defaultMaxMevTax = _defaultMaxMevTax;
    defaultMevTaxEnabled = _defaultMevTaxEnabled;
  }

  /// @inheritdoc IFeeAuctionPluginFactory
  function setDefaultParameters(
    uint24 _baseFee,
    uint24 _mevTaxMultiplier,
    uint24 _maxMevTax,
    bool _mevTaxEnabled
  ) external override onlyAdministrator {
    defaultBaseFee = _baseFee;
    defaultMevTaxMultiplier = _mevTaxMultiplier;
    defaultMaxMevTax = _maxMevTax;
    defaultMevTaxEnabled = _mevTaxEnabled;
    emit DefaultParametersChanged(_baseFee, _mevTaxMultiplier, _maxMevTax, _mevTaxEnabled);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(
    address pool,
    address,
    address,
    address,
    address,
    bytes calldata
  ) external override returns (address) {
    require(msg.sender == algebraFactory, 'Only Algebra factory');
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory, 'Only Algebra factory');
  }

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(
      factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender),
      'Only pools administrator'
    );

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool does not exist');

    return _createPlugin(pool);
  }

  /// @notice Creates a new plugin for a pool
  /// @param pool The pool address
  /// @return plugin The created plugin address
  function _createPlugin(address pool) internal returns (address plugin) {
    require(pluginByPool[pool] == address(0), 'Plugin already exists');

    plugin = address(
      new FeeAuctionPlugin(
        pool,
        algebraFactory,
        address(this),
        defaultBaseFee,
        defaultMevTaxMultiplier,
        defaultMaxMevTax,
        defaultMevTaxEnabled
      )
    );

    pluginByPool[pool] = plugin;
    emit PluginCreated(pool, plugin);
  }
}
