// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IFeeDiscountPlugin.sol';
import './interfaces/IFeeDiscountPluginImplementation.sol';
import './libraries/FeeDiscountStorage.sol';

/// @title FeeDiscount Connector
/// @notice This contract provides delegatecall interface to FeeDiscount plugin implementation
/// @dev Inherits from IFeeDiscountPlugin and provides all public methods as thin wrappers
abstract contract FeeDiscountConnector is IFeeDiscountPlugin, BaseConnector {
  using Plugins for uint8;

  uint8 internal constant FEE_DISCOUNT_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable feeDiscountImplementation;

  constructor(address _feeDiscountImplementation) {
    feeDiscountImplementation = _feeDiscountImplementation;
  }

  /// @notice Initialize FeeDiscount plugin via delegatecall
  function _initializeFeeDiscount(address _feeDiscountRegistry) internal returns (uint8) {
    _delegateCall(
      feeDiscountImplementation,
      abi.encodeCall(IFeeDiscountPluginImplementation.initializeFeeDiscount, (_feeDiscountRegistry))
    );
    return FEE_DISCOUNT_PLUGIN_CONFIG;
  }

  /// @notice Apply fee discount via delegatecall
  function _applyFeeDiscount(address user, address pool, uint24 fee) internal returns (uint24) {
    bytes memory returnData = _delegateCall(
      feeDiscountImplementation,
      abi.encodeCall(IFeeDiscountPluginImplementation.applyFeeDiscount, (user, pool, fee))
    );
    return abi.decode(returnData, (uint24));
  }

  // ###### Public Interface (IFeeDiscountPlugin) ######

  /// @inheritdoc IFeeDiscountPlugin
  function setFeeDiscountRegistry(address registry) external override {
    _authorize();
    _delegateCall(
      feeDiscountImplementation,
      abi.encodeCall(IFeeDiscountPluginImplementation.setFeeDiscountRegistry, (registry))
    );
    emit FeeDiscountRegistry(registry);
  }

  /// @inheritdoc IFeeDiscountPlugin
  function feeDiscountRegistry() external view override returns (address) {
    return FeeDiscountStorage.layout().feeDiscountRegistry;
  }
}
