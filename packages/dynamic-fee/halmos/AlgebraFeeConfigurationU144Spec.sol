// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../contracts/types/AlgebraFeeConfiguration.sol';
import { AlgebraFeeConfigurationU144, AlgebraFeeConfigurationU144Lib } from '../contracts/types/AlgebraFeeConfigurationU144.sol';

/// @notice Halmos specs for the packed fee configuration, each holding for every input
contract AlgebraFeeConfigurationU144Spec {
  /// @dev Packing then reading returns every field, so no two fields overlap
  function check_packThenReadReturnsEveryField(uint16 a1, uint16 a2, uint32 b1, uint32 b2, uint16 g1, uint16 g2, uint16 bf) public pure {
    AlgebraFeeConfigurationU144 packed = AlgebraFeeConfigurationU144Lib.pack(
      AlgebraFeeConfiguration({ alpha1: a1, alpha2: a2, beta1: b1, beta2: b2, gamma1: g1, gamma2: g2, baseFee: bf })
    );
    assert(packed.alpha1() == a1);
    assert(packed.alpha2() == a2);
    assert(packed.beta1() == b1);
    assert(packed.beta2() == b2);
    assert(packed.gamma1() == g1);
    assert(packed.gamma2() == g2);
    assert(packed.baseFee() == bf);
  }

  /// @dev Reading then packing rebuilds the word, so every bit belongs to a field
  function check_readThenPackRebuildsTheWord(uint144 raw) public pure {
    AlgebraFeeConfigurationU144 word = AlgebraFeeConfigurationU144.wrap(raw);
    AlgebraFeeConfigurationU144 packed = AlgebraFeeConfigurationU144Lib.pack(
      AlgebraFeeConfiguration({
        alpha1: word.alpha1(),
        alpha2: word.alpha2(),
        beta1: word.beta1(),
        beta2: word.beta2(),
        gamma1: word.gamma1(),
        gamma2: word.gamma2(),
        baseFee: word.baseFee()
      })
    );
    assert(AlgebraFeeConfigurationU144.unwrap(packed) == raw);
  }
}
