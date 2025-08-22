// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IFundsSplitter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FundsSplitter
/// @notice Abstract contract for stateless ETH/ERC20 splitting without storing funds.
///         Enforces recipient shares via configurable basis points.
abstract contract FundsSplitter is IFundsSplitter {
    using SafeERC20 for IERC20;

    // ========== Errors ==========

    // ========== Constants ==========

    /// @notice Total basis points used to express 100% (1% = 100 bps)
    uint256 public constant TOTAL_BPS = 10_000;

    // ========== Storage ==========

    /// @notice Current list of recipient addresses
    address[] public recipients;

    /// @notice Mapping of recipient address to share in basis points
    mapping(address => uint256) public sharesBps;

    // ========== Access Control Hook ==========

    /// @notice Internal function that must be implemented by child contract to enforce admin access control
    function _onlyFundsAdmin() internal view virtual;

    // ========== Public Methods ==========

    /// @inheritdoc IFundsSplitter
    function updateShares(address[] calldata _recipients, uint256[] calldata _sharesBps) external override {
        _onlyFundsAdmin();
        _setShares(_recipients, _sharesBps);
        emit SharesUpdated(_recipients, _sharesBps);
    }

    /// @inheritdoc IFundsSplitter
    function getRecipients() external view override returns (address[] memory, uint256[] memory) {
        uint256[] memory out = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            out[i] = sharesBps[recipients[i]];
        }
        return (recipients, out);
    }

    // ========== Internal Methods ==========

    /// @notice Internal function to split ERC20 tokens - can be called by inheriting contracts
    /// @param token The ERC20 token address
    /// @param amount The amount to split
    /// @param dustRecipient Address to receive any remaining dust from rounding
    function _splitERC20(address token, uint256 amount, address dustRecipient) internal {
        uint256[] memory amounts = new uint256[](recipients.length);
        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < recipients.length; i++) {
            address r = recipients[i];
            uint256 share = (amount * sharesBps[r]) / TOTAL_BPS;
            amounts[i] = share;
            totalDistributed += share;
            IERC20(token).safeTransfer(r, share);
        }

        // Send any remaining dust to the specified recipient
        uint256 remainder = amount - totalDistributed;
        if (remainder > 0 && dustRecipient != address(0)) {
            IERC20(token).safeTransfer(dustRecipient, remainder);
        }

        emit SplitExecuted(token, amount, recipients, amounts);
    }

    /// @notice Internal function to split ETH - can be called by inheriting contracts
    /// @param dustRecipient Address to receive any remaining dust from rounding
    function _splitETH(address dustRecipient) internal {
        uint256 value = msg.value;
        uint256[] memory amounts = new uint256[](recipients.length);
        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < recipients.length; i++) {
            address r = recipients[i];
            uint256 share = (value * sharesBps[r]) / TOTAL_BPS;
            amounts[i] = share;
            totalDistributed += share;
            (bool success,) = r.call{value: share}("");
            require(success, "ETH transfer failed");
        }

        // Send any remaining dust to the specified recipient
        uint256 remainder = value - totalDistributed;
        if (remainder > 0 && dustRecipient != address(0)) {
            (bool success,) = dustRecipient.call{value: remainder}("");
            require(success, "ETH dust transfer failed");
        }

        emit SplitExecuted(address(0), value, recipients, amounts);
    }

    // ========== Internal Methods ==========

    /// @notice Internal function to update the share map and recipient list
    function _setShares(address[] memory _recipients, uint256[] memory _sharesBps) internal {
        require(_recipients.length == _sharesBps.length, "Recipients and shares length mismatch");

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            sharesBps[recipients[i]] = 0;
        }

        for (uint256 i = 0; i < _recipients.length; i++) {
            address r = _recipients[i];
            uint256 s = _sharesBps[i];
            require(r != address(0) && s > 0, "Invalid recipient or share");
            sharesBps[r] = s;
            total += s;
        }

        require(total == TOTAL_BPS, "Invalid total shares");
        recipients = _recipients;
    }
}