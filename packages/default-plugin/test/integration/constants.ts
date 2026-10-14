/**
 * Integration Test Constants - Base Network Fork
 */

// Network contract addresses
export const ADDRESSES = {
  ALGEBRA_FACTORY: '0x51a744E9FEdb15842c3080d0937C99A365C6c358',
  NFT_POSITION_MANAGER: '0x8aD26dc9f724c9A7319E0E25b907d15626D9a056',
  SWAP_ROUTER: '0x5Cd40c7E21A15E7FC2503Fffd77cF70c60628F6C',
  // farmingAddress of the plugin factory deployed to Base
  FARMING_ADDRESS: '0x3aA96eDb755C44F3E50C5408a36abb52f28326Ba',
} as const;

// Pool initialization constants
export const POOL_CONSTANTS = {
  INITIAL_SQRT_PRICE: '79228162514264337593543950336', // 1:1 price
  TICK_LOWER: -887220,
  TICK_UPPER: 887220,
} as const;

// Sqrt ratio bounds for swaps
export const SQRT_RATIO = {
  MIN: 4295128739n,
  MAX: 1461446703485210103287273052203988822378723970342n,
} as const;
