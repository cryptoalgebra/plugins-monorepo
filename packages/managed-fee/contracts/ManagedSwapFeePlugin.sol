// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import {BaseAbstractPlugin} from '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import './interfaces/IManagedSwapFeePlugin.sol';

/// @title Algebra Integral 1.2.1 managed swap fee plugin
/// @notice This plugin get fees value from the swap and apply that fees to swap
abstract contract ManagedSwapFeePlugin is BaseAbstractPlugin, IManagedSwapFeePlugin {
  using Plugins for uint8;
  using ECDSA for bytes32;

  uint8 private constant defaultPluginConfig = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  mapping(address => bool) public override whitelistedAddresses;
  mapping(bytes32 => bool) private usedNonces;

  constructor() {}

  function setWhitelistStatus(address _address, bool status) external override{
    _authorize();
    whitelistedAddresses[_address] = status;
    emit WhitelistedAddress(_address, status);
  }

  function _getManagedFee(bytes memory pluginData) internal returns (uint24){
    (bytes32 nonce, uint24 fee, address user, uint32 expireTime, bytes memory signature) = _parsePluginData(pluginData);
    if(fee >= 1000000) revert FeeExceedsLimit();
    if(usedNonces[nonce]) revert InvalidNonce();
    if(expireTime < block.timestamp) revert Expired();
    if(user != tx.origin) revert NotAllowed();

    _verifySignature(ECDSA.toEthSignedMessageHash(_getParamsHash(nonce, fee, user, expireTime)), signature);
    usedNonces[nonce] = true;
    return fee;
  }

  function _parsePluginData(bytes memory pluginData) private pure returns(bytes32, uint24, address, uint32, bytes memory) {
    PluginData memory data = abi.decode(pluginData, (PluginData));
    return (data.nonce, data.fee, data.user, data.expire, data.signature);
  }

  function _verifySignature(bytes32 hash, bytes memory signature) private view {
    address recoveredSigner = hash.recover(signature);
    if(!whitelistedAddresses[recoveredSigner]) revert NotWhitelisted();
  }

  function _getParamsHash(bytes32 nonce, uint24 fee, address user, uint32 expire) private pure returns (bytes32) {
    return keccak256(abi.encode(nonce, fee, user, expire));
  }

}
