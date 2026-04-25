// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Relm Token (RELM)
/// @notice Gameplay reward token on Soneium. Minting is restricted to
///         a single backend signer (`minter`). The scorer tallies off-
///         chain events and mints here — we never mint on-chain from
///         raw gameplay because that'd blow gas + leak the curve.
///
///         Hard supply cap is set at construction and enforced on every
///         mint — once we hit `MAX_SUPPLY` the token becomes purely
///         deflationary (only burns, no new mints). Burn comes from
///         OpenZeppelin's standard ERC20Burnable so any in-game sink
///         contract can call `burnFrom` after an `approve`.
///
///         `owner` can rotate the minter key in case it's compromised;
///         that's the only privileged operation. There's no team mint
///         function, no upgradability, no admin pause.
contract RelmToken is ERC20, ERC20Burnable, Ownable {
    /// @notice Hard supply cap. Locked at deployment, never changes.
    uint256 public immutable MAX_SUPPLY;

    address public minter;

    event MinterRotated(address indexed previousMinter, address indexed newMinter);

    error NotMinter(address caller);
    error ZeroAddress();
    error CapExceeded(uint256 requested, uint256 cap);
    error InvalidCap();

    constructor(address initialMinter, uint256 maxSupply)
        ERC20("Relm Token", "RELM")
        Ownable(msg.sender)
    {
        if (initialMinter == address(0)) revert ZeroAddress();
        if (maxSupply == 0) revert InvalidCap();
        minter = initialMinter;
        MAX_SUPPLY = maxSupply;
        emit MinterRotated(address(0), initialMinter);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        if (totalSupply() + amount > MAX_SUPPLY) revert CapExceeded(totalSupply() + amount, MAX_SUPPLY);
        _mint(to, amount);
    }

    /// @notice Batch version so the scorer can settle N rewards in one tx.
    /// @dev Reverts the entire batch if the running total would breach the
    ///      supply cap. Off-chain code is responsible for sizing batches
    ///      so they fit; we don't partially fill.
    function mintBatch(address[] calldata recipients, uint256[] calldata amounts) external {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        uint256 len = recipients.length;
        require(len == amounts.length, "length mismatch");
        uint256 total;
        for (uint256 i = 0; i < len; ++i) {
            total += amounts[i];
        }
        if (totalSupply() + total > MAX_SUPPLY) revert CapExceeded(totalSupply() + total, MAX_SUPPLY);
        for (uint256 i = 0; i < len; ++i) {
            _mint(recipients[i], amounts[i]);
        }
    }

    /// @notice Headroom under the cap — useful for the scorer to clamp
    ///         a pending batch instead of having the tx revert.
    function remainingMintable() external view returns (uint256) {
        uint256 ts = totalSupply();
        return ts >= MAX_SUPPLY ? 0 : MAX_SUPPLY - ts;
    }

    function rotateMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterRotated(minter, newMinter);
        minter = newMinter;
    }
}
