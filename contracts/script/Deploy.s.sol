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
contract Deploy is Script {
    function run() external {
        address minter = vm.envAddress("RELM_MINTER");
        vm.startBroadcast();
        RelmToken token = new RelmToken(minter);
        vm.stopBroadcast();
        console2.log("RelmToken deployed at", address(token));
        console2.log("Initial minter", minter);
    }
}
