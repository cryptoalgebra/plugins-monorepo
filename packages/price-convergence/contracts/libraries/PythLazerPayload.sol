// SPDX-License-Identifier: Apache-2.0
pragma solidity =0.8.20;

/// @dev Minimal parser for the official Pyth Lazer payload format.
library PythLazerPayload {
  uint32 internal constant FORMAT_MAGIC = 2479346549;

  struct Price {
    uint64 timestamp;
    int64 value;
    int16 exponent;
  }

  error InvalidPayload();
  error PriceNotFound();

  function parsePrice(bytes memory payload, uint32 targetFeedId) internal pure returns (Price memory result) {
    if (payload.length < 14 || payload.length > type(uint16).max) revert InvalidPayload();

    uint16 pos;
    if (_readUint32(payload, pos) != FORMAT_MAGIC) revert InvalidPayload();
    pos += 4;
    result.timestamp = _readUint64(payload, pos);
    pos += 8;
    pos += 1; // channel
    uint8 feedsLength = _readUint8(payload, pos);
    pos += 1;

    bool foundFeed;
    bool foundPrice;
    bool foundExponent;

    for (uint8 i; i < feedsLength; ++i) {
      uint32 feedId = _readUint32(payload, pos);
      pos += 4;
      uint8 propertiesLength = _readUint8(payload, pos);
      pos += 1;
      bool isTarget = feedId == targetFeedId;
      if (isTarget) foundFeed = true;

      for (uint8 j; j < propertiesLength; ++j) {
        uint8 property = _readUint8(payload, pos);
        pos += 1;

        if (property == 0) {
          int64 value = int64(_readUint64(payload, pos));
          pos += 8;
          if (isTarget) {
            result.value = value;
            foundPrice = value != 0;
          }
        } else if (property == 4) {
          int16 exponent = int16(_readUint16(payload, pos));
          pos += 2;
          if (isTarget) {
            result.exponent = exponent;
            foundExponent = true;
          }
        } else {
          pos = _skipProperty(payload, pos, property);
        }
      }
    }

    if (pos != payload.length) revert InvalidPayload();
    if (!foundFeed || !foundPrice || !foundExponent) revert PriceNotFound();
  }

  function _skipProperty(bytes memory payload, uint16 pos, uint8 property) private pure returns (uint16) {
    if (property == 1 || property == 2 || property == 5 || property == 10 || property == 11) {
      _requireAvailable(payload, pos, 8);
      return pos + 8;
    }
    if (property == 3 || property == 9) {
      _requireAvailable(payload, pos, 2);
      return pos + 2;
    }
    if (property == 6 || property == 7 || property == 8 || property == 12) {
      uint8 exists = _readUint8(payload, pos);
      pos += 1;
      if (exists != 0) {
        _requireAvailable(payload, pos, 8);
        pos += 8;
      }
      return pos;
    }
    revert InvalidPayload();
  }

  function _readUint8(bytes memory data, uint16 pos) private pure returns (uint8 value) {
    _requireAvailable(data, pos, 1);
    assembly {
      value := shr(248, mload(add(add(data, 0x20), pos)))
    }
  }

  function _readUint16(bytes memory data, uint16 pos) private pure returns (uint16 value) {
    _requireAvailable(data, pos, 2);
    assembly {
      value := shr(240, mload(add(add(data, 0x20), pos)))
    }
  }

  function _readUint32(bytes memory data, uint16 pos) private pure returns (uint32 value) {
    _requireAvailable(data, pos, 4);
    assembly {
      value := shr(224, mload(add(add(data, 0x20), pos)))
    }
  }

  function _readUint64(bytes memory data, uint16 pos) private pure returns (uint64 value) {
    _requireAvailable(data, pos, 8);
    assembly {
      value := shr(192, mload(add(add(data, 0x20), pos)))
    }
  }

  function _requireAvailable(bytes memory data, uint16 pos, uint16 length) private pure {
    if (uint256(pos) + length > data.length) revert InvalidPayload();
  }
}
