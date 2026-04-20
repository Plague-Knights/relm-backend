// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Relm Token (RELM)
/// @notice Gameplay reward token on Soneium. Minting is restricted to
///         a single backend signer (`minter`). The scorer tallies off-
///         chain events and mints here — we never mint on-chain from
///         raw gameplay because that'd blow gas + leak the curve.
///
///         `owner` can rotate the minter key in case it's compromised;
///         that's the only privileged operation. No burning, no pause,
///         nothing else.
contract RelmToken is ERC20, Ownable {
    address public minter;

    event MinterRotated(address indexed previousMinter, address indexed newMinter);

    error NotMinter(address caller);
    error ZeroAddress();

    constructor(address initialMinter) ERC20("Relm Token", "RELM") Ownable(msg.sender) {
        if (initialMinter == address(0)) revert ZeroAddress();
        minter = initialMinter;
        emit MinterRotated(address(0), initialMinter);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        _mint(to, amount);
    }

    /// @notice Batch version so the scorer can settle N rewards in one tx.
    function mintBatch(address[] calldata recipients, uint256[] calldata amounts) external {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        uint256 len = recipients.length;
        require(len == amounts.length, "length mismatch");
        for (uint256 i = 0; i < len; ++i) {
            _mint(recipients[i], amounts[i]);
        }
    }

    function rotateMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterRotated(minter, newMinter);
        minter = newMinter;
    }
}
