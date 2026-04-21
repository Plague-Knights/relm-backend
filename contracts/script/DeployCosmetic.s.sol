// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { RelmCosmetic } from "../src/RelmCosmetic.sol";

/// Deploys RelmCosmetic and seeds three starter cosmetic types so the
/// shop has something to display on day one. Re-runnable safely — each
/// run produces a new contract; only run once per environment.
contract DeployCosmetic is Script {
    function run() external {
        vm.startBroadcast();
        RelmCosmetic shop = new RelmCosmetic();

        // Phase-1 cosmetics. Metadata URIs point at the link app's
        // /shop/meta/<id>.json route; we'll lift them to IPFS once
        // there's enough volume to justify pinning.
        string memory baseUri = "https://relm-link-production.up.railway.app/shop/meta";

        uint256 capeId       = shop.registerType(0.001 ether, string.concat(baseUri, "/1.json"), 0);
        uint256 trailId      = shop.registerType(0.002 ether, string.concat(baseUri, "/2.json"), 0);
        uint256 founderId    = shop.registerType(0.01  ether, string.concat(baseUri, "/3.json"), 100);

        vm.stopBroadcast();
        console2.log("RelmCosmetic deployed at", address(shop));
        console2.log("Type 1 (Crimson Cape):", capeId);
        console2.log("Type 2 (Blue Particle Trail):", trailId);
        console2.log("Type 3 (Founder Pickaxe Skin, 100 max):", founderId);
    }
}
