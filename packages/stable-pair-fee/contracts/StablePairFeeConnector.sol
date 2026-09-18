// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IStablePairFeePlugin.sol';
import './interfaces/IStablePairFeePluginImplementation.sol';
import './libraries/StablePairFeeStorage.sol';

/// @dev pool() is public on both plugin bases
interface IPluginPool {
  function pool() external view returns (address);
}

/// @title Stable Pair Fee Connector
/// @notice StablePairFee module provides delegatecall functions to StablePairFee implementation
/// @dev The fee replaces the pool fee, so do not combine with other LP fee modules
/// @dev Composing plugin must keep the returned fee plus its plugin fee below 1e6
abstract contract StablePairFeeConnector is IStablePairFeePlugin, BaseConnector {
  string internal constant STABLE_PAIR_FEE_MODULE_NAME = 'Stable Pair Fee Plugin';
  uint8 internal constant STABLE_PAIR_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable stablePairFeeImplementation;

  constructor(address _stablePairFeeImplementation) {
    stablePairFeeImplementation = _stablePairFeeImplementation;
  }

  /// @notice Set fee config via delegatecall
  function _setStableFeeConfig(StableFeeConfig memory feeConfig) internal {
    _delegateCall(stablePairFeeImplementation, abi.encodeCall(IStablePairFeePluginImplementation.setFeeConfig, (feeConfig)));
  }

  /// @notice Get fee for a swap and update state via delegatecall
  /// @param sqrtPriceX96 Pool price before the swap
  /// @dev Reverts if the config is not set
  function _getStableFeeAndUpdateState(bool zeroToOne, uint160 sqrtPriceX96) internal returns (uint24) {
    bytes memory returnData = _delegateCall(
      stablePairFeeImplementation,
      abi.encodeCall(IStablePairFeePluginImplementation.getFeeAndUpdateState, (zeroToOne, sqrtPriceX96))
    );
    return abi.decode(returnData, (uint24));
  }

  // ###### Public Interface (IStablePairFeePlugin) ######

  /// @inheritdoc IStablePairFeePlugin
  function stableFeeConfig()
    external
    view
    override
    returns (uint24 k, uint24 optimalFeeE6, uint8 targetMultiplier, uint160 referenceSqrtPriceX96)
  {
    StableFeeConfig storage feeConfig = StablePairFeeStorage.layout().feeConfig;
    return (feeConfig.k, feeConfig.optimalFeeE6, feeConfig.targetMultiplier, feeConfig.referenceSqrtPriceX96);
  }

  /// @inheritdoc IStablePairFeePlugin
  function stableFeeState() external view override returns (uint40 decayingFeeE12, uint160 sqrtAmmPriceX96, uint40 blockNumber) {
    StableFeeState storage feeState = StablePairFeeStorage.layout().feeState;
    return (feeState.decayingFeeE12, feeState.sqrtAmmPriceX96, feeState.blockNumber);
  }

  /// @inheritdoc IStablePairFeePlugin
  function getStableFees() external view override returns (uint24 feeZeroToOne, uint24 feeOneToZero) {
    StablePairFeeStorage.Layout storage layout = StablePairFeeStorage.layout();
    (uint160 sqrtPriceX96, , , , , ) = IAlgebraPoolState(IPluginPool(address(this)).pool()).globalState();

    // Staticcall runs in implementation storage, so pass a snapshot of ours
    return IStablePairFeePluginImplementation(stablePairFeeImplementation).quoteFees(layout.feeConfig, layout.feeState, sqrtPriceX96);
  }

  /// @inheritdoc IStablePairFeePlugin
  function setStableFeeConfig(StableFeeConfig calldata feeConfig) external override {
    _authorize();
    _setStableFeeConfig(feeConfig);
    emit StableFeeConfigUpdated(feeConfig);
  }
}
