// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Relm Energy Refill
/// @notice Players burn RELM here to refill their off-chain energy
///         meter. The contract emits `Refilled(player, amount)` and
///         the backend watcher credits the player's energy in
///         Postgres on confirmation.
///
///         Tokens are forwarded to the dead address — no treasury
///         accounting, deflationary by design (matches the cosmetic
///         shop's RELM payment path).
///
///         `priceWei` here actually means "RELM tokens" (denominated
///         in 18-decimal wei because RelmToken is an ERC-20). Owner
///         can rotate the price as the game economy matures.
contract RelmEnergyRefill is Ownable {
    IERC20 public immutable relmToken;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 public refillPrice;
    uint256 public refillAmount;

    event Refilled(address indexed player, uint256 amount, uint256 paid);
    event PriceUpdated(uint256 newPrice, uint256 newAmount);

    error TransferFailed();
    error ZeroAddress();

    constructor(address relmTokenAddr, uint256 initialPrice, uint256 initialAmount) Ownable(msg.sender) {
        if (relmTokenAddr == address(0)) revert ZeroAddress();
        relmToken = IERC20(relmTokenAddr);
        refillPrice = initialPrice;
        refillAmount = initialAmount;
        emit PriceUpdated(initialPrice, initialAmount);
    }

    function refill() external {
        bool ok = relmToken.transferFrom(msg.sender, DEAD, refillPrice);
        if (!ok) revert TransferFailed();
        emit Refilled(msg.sender, refillAmount, refillPrice);
    }

    function setPrice(uint256 newPrice, uint256 newAmount) external onlyOwner {
        refillPrice = newPrice;
        refillAmount = newAmount;
        emit PriceUpdated(newPrice, newAmount);
    }
}
