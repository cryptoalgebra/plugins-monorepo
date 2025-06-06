// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Managed Swap Fee Plugin Interface
/// @notice Interface for interacting with the Managed Swap Fee Plugin
interface IManagedSwapFeePlugin {
    
    error InvalidNonce();
    error FeeExceedsLimit();
    error NotWhitelisted();
    error Expired();
    error NotAllowed();

    event WhitelistedAddress(address indexed _address, bool status);

    /// @notice Struct representing plugin data
    struct PluginData {
        bytes32 nonce;
        uint24 fee;
        address user;
        uint32 expire;
        bytes signature;
    }

    /// @notice Checks if an address is whitelisted
    /// @param _address The address to check
    /// @return True if the address is whitelisted, false otherwise
    function whitelistedAddresses(address _address) external view returns (bool);

    /// @notice Whitelists an address
    /// @param _address The address to whitelist
    function setWhitelistStatus(address _address, bool status) external;
}
