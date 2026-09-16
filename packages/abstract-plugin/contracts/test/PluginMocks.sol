// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @dev Only the pool surface AbstractPlugin reads and writes, counting config writes so a skipped one shows
contract PluginPoolMock {
  address public plugin;
  uint8 public pluginConfig;
  uint256 public setPluginConfigCalls;

  function setPlugin(address newPlugin) external {
    plugin = newPlugin;
  }

  function globalState() external view returns (uint160, int24, uint16, uint8, uint16, bool) {
    return (0, 0, 0, pluginConfig, 0, true);
  }

  function setPluginConfig(uint8 newConfig) external {
    require(msg.sender == plugin);
    pluginConfig = newConfig;
    setPluginConfigCalls++;
  }
}

/// @dev The role check BaseAbstractPlugin asks the Algebra factory for, keyed by role so a wrong role fails
contract PluginFactoryRolesMock {
  address public immutable owner = msg.sender;
  mapping(bytes32 => mapping(address => bool)) public hasRole;

  function grantRole(bytes32 role, address account) external {
    hasRole[role][account] = true;
  }

  function hasRoleOrOwner(bytes32 role, address account) external view returns (bool) {
    return account == owner || hasRole[role][account];
  }
}

/// @dev Records what the factory forwards and answers with a fixed pool, standing in for the entry point
contract CustomPoolEntryPointMock {
  address public immutable pool;
  address public lastFactory;
  address public lastCreator;
  address public lastTokenA;
  address public lastTokenB;
  bytes public lastData;

  constructor(address _pool) {
    pool = _pool;
  }

  function createCustomPool(
    address factory,
    address creator,
    address tokenA,
    address tokenB,
    bytes calldata data
  ) external returns (address) {
    (lastFactory, lastCreator, lastTokenA, lastTokenB, lastData) = (factory, creator, tokenA, tokenB, data);
    return pool;
  }
}

contract PluginFeeTokenMock is ERC20 {
  constructor() ERC20('Plugin Fee', 'FEE') {
    _mint(msg.sender, 10 ** 24);
  }
}
