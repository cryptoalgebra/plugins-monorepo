// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IFeeDiscountPlugin.sol';
import './interfaces/IFeeDiscountPluginImplementation.sol';
import './libraries/FeeDiscountStorage.sol';
import './libraries/FeeDiscountMath.sol';

/// @title FeeDiscount Connector
/// @notice This contract provides delegatecall interface to FeeDiscount plugin implementation
abstract contract FeeDiscountConnector is IFeeDiscountPlugin, BaseConnector {
  using Plugins for uint16;

  string internal constant FEE_DISCOUNT_MODULE_NAME = 'Fee Discount Plugin';
  uint16 internal constant FEE_DISCOUNT_PLUGIN_CONFIG = uint16(Plugins.BEFORE_SWAP_FLAG);

  /// @dev changes only on full plugin upgrade
  address internal immutable feeDiscountImplementation;

  constructor(address _feeDiscountImplementation) {
    feeDiscountImplementation = _feeDiscountImplementation;
  }

  /// @notice Initialize FeeDiscount plugin via delegatecall
  function _initializeFeeDiscount(address _feeDiscountRegistry) internal {
    _delegateCall(
      feeDiscountImplementation,
      abi.encodeCall(IFeeDiscountPluginImplementation.initializeFeeDiscount, (_feeDiscountRegistry))
    );
  }

  /// @notice Apply fee discount via delegatecall
  function _applyFeeDiscount(address user, address pool, uint24 fee) internal returns (uint24) {
    bytes memory returnData = _delegateCall(
      feeDiscountImplementation,
      abi.encodeCall(IFeeDiscountPluginImplementation.applyFeeDiscount, (user, pool, fee))
    );
    return abi.decode(returnData, (uint24));
  }

  /// @notice The fee _applyFeeDiscount would return, for getSwapFee
  function _quoteFeeDiscount(address user, address pool, uint24 fee) internal view returns (uint24) {
    return FeeDiscountMath.discountedFee(FeeDiscountStorage.layout().feeDiscountRegistry, user, pool, fee);
  }

  // ###### Public Interface (IFeeDiscountPlugin) ######

  /// @inheritdoc IFeeDiscountPlugin
  function setFeeDiscountRegistry(address registry) external override {
    _authorize();
    _delegateCall(feeDiscountImplementation, abi.encodeCall(IFeeDiscountPluginImplementation.setFeeDiscountRegistry, (registry)));
    emit FeeDiscountRegistry(registry);
  }

  /// @inheritdoc IFeeDiscountPlugin
  function feeDiscountRegistry() external view override returns (address) {
    return FeeDiscountStorage.layout().feeDiscountRegistry;
  }
}
