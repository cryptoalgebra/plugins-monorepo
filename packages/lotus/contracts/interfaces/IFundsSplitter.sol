// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFundsSplitter
/// @notice Interface for a stateless ETH/ERC20 fund splitter contract
interface IFundsSplitter {
    // ========== Events ==========

    /// @notice Emitted when shares are updated by the admin
    event SharesUpdated(address[] recipients, uint256[] sharesBps);

    /// @notice Emitted after a successful split operation (ETH or ERC20)
    event SplitExecuted(address indexed token, uint256 totalAmount, address[] recipients, uint256[] amounts);

    // ========== Functions ==========

    /// @notice Returns the current recipient list and their share percentages in basis points
    /// @return recipients List of recipient addresses
    /// @return sharesBps Corresponding list of share amounts in basis points (1% = 100 bps)
    function getRecipients() external view returns (address[] memory recipients, uint256[] memory sharesBps);

    /// @notice Updates the recipients and their shares (admin only)
    /// @param recipients List of recipient addresses
    /// @param sharesBps List of corresponding shares in basis points (1% = 100 bps)
    function updateShares(address[] calldata recipients, uint256[] calldata sharesBps) external;
}