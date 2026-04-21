// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { RelmEnergyRefill } from "../src/RelmEnergyRefill.sol";

contract DeployEnergyRefill is Script {
    function run() external {
        address relmTokenAddr = vm.envAddress("RELM_TOKEN_ADDR");
        // Initial: 50 RELM (in 18-decimal wei) refills 100 energy.
        uint256 price = 50 ether;
        uint256 amount = 100;

        vm.startBroadcast();
        RelmEnergyRefill rf = new RelmEnergyRefill(relmTokenAddr, price, amount);
        vm.stopBroadcast();
        console2.log("RelmEnergyRefill deployed at", address(rf));
        console2.log("Refill: ", amount, "energy for", price);
    }
}
