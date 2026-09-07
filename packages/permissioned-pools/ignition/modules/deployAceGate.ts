// @ts-nocheck
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

// Base Sepolia, ACE v1.2.0. Addresses and hashes verified against the ACE Coordinator API.
const config = {
  admin: '', // empty = deployer. Immutable with no transfer function, so use a multisig in prod
  identityRegistry: '0x2F50E9873803B0B9e8Ddc11b097976c9F7E06e3F',
  credentialRegistry: '0xC29427DdD150Fe443d702B27e1247435730b85C8',
  credentialTypes: {
    kyc: '0x455af80b0708d48777181ab288cb8aad0befe0f51a15ddafdd875abdf26278c6',
    accredited: '0x176f73d7d710f2d36df66a084162d59191f4cd788a102393e110130affbb4497',
  },
  token: {
    name: 'Permissioned Test Token',
    symbol: 'PTT',
    requiredCredentialType: 'kyc' as 'kyc' | 'accredited',
  },
};

const NO_VALIDATOR = '0x0000000000000000000000000000000000000000';
const SWAP_ALLOWED = '0x0001';
const SWAP_AND_LIQUIDITY = '0x0003';
const KIND_CREDENTIAL = 0;

// (validator, flags, kind, credentialTypeId). Flags are unioned, generous rule first short-circuits.
const rules = [
  [NO_VALIDATOR, SWAP_AND_LIQUIDITY, KIND_CREDENTIAL, config.credentialTypes.accredited],
  [NO_VALIDATOR, SWAP_ALLOWED, KIND_CREDENTIAL, config.credentialTypes.kyc],
];

export default buildModule('AceGate', (m) => {
  const admin = config.admin === '' ? m.getAccount(0) : config.admin;

  const checker = m.contract(
    'AceAllowlistChecker',
    [admin, config.identityRegistry, config.credentialRegistry, rules],
    { id: 'AceAllowlistChecker' }
  );

  const token = m.contract(
    'TestPermissionedERC20',
    [
      config.token.name,
      config.token.symbol,
      config.identityRegistry,
      config.credentialRegistry,
      config.credentialTypes[config.token.requiredCredentialType],
    ],
    { id: 'TestPermissionedERC20' }
  );

  return { checker, token };
});

// Wiring is left out: registering the checker needs the PERMISSIONED_POOL_MANAGER role, and
// exempting the pool and router needs their addresses, which exist only after the pool is created.
