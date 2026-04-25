// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { RelmToken } from "../src/RelmToken.sol";

/// @notice Deploys RelmToken on Soneium Minato.
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url soneium_minato \
///     --broadcast \
///     --private-key $DEPLOYER_PRIVATE_KEY
///
/// Required env:
///   RELM_MINTER       — address of the backend signer that mints rewards
///   RELM_MAX_SUPPLY   — hard cap in token wei (decimal). Defaults to
///                       100,000,000 RELM = 100_000_000 * 1e18 if unset.
contract Deploy is Script {
    uint256 constant DEFAULT_MAX_SUPPLY = 100_000_000 * 1e18;

    function run() external {
        address minter = vm.envAddress("RELM_MINTER");
        uint256 maxSupply = vm.envOr("RELM_MAX_SUPPLY", DEFAULT_MAX_SUPPLY);
        vm.startBroadcast();
        RelmToken token = new RelmToken(minter, maxSupply);
        vm.stopBroadcast();
        console2.log("RelmToken deployed at", address(token));
        console2.log("Initial minter", minter);
        console2.log("Max supply (wei)", maxSupply);
    }
}
