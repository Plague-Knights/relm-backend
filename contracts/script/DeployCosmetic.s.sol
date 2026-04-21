// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { RelmCosmetic } from "../src/RelmCosmetic.sol";

/// Deploys RelmCosmetic v2 (perks + dual-currency) and seeds five
/// starter types so the shop launches with a real spread of items.
///
/// Cosmetic types:
/// 1. Crimson Cape       — 0.001 ETH OR 200 RELM, pure accessory
/// 2. Cobalt Trail       — 0.002 ETH OR 400 RELM, pure accessory
/// 3. Founder Pickaxe    — 0.01 ETH only, skins relm_core:pick_wood,
///                         UNBREAKABLE + KEEP_ON_DEATH + SOULBOUND, 100 max
/// 4. Iron Pickaxe Skin  — RELM only (1500), skins relm_core:pick_iron,
///                         KEEP_ON_DEATH (RELM-grindable upgrade path)
/// 5. Wood Axe Skin      — RELM only (300), skins relm_core:axe_wood,
///                         no perks (entry-level RELM sink)
///
/// Run with: RELM_TOKEN_ADDR=0x... forge script script/DeployCosmetic.s.sol:DeployCosmetic ...
contract DeployCosmetic is Script {
    uint16 constant UNBREAKABLE   = 1 << 0;
    uint16 constant KEEP_ON_DEATH = 1 << 1;
    uint16 constant SOULBOUND     = 1 << 2;

    function run() external {
        address relmTokenAddr = vm.envAddress("RELM_TOKEN_ADDR");
        string memory baseUri = "https://relm-link-production.up.railway.app/api/cosmetics/meta";

        vm.startBroadcast();
        RelmCosmetic shop = new RelmCosmetic(relmTokenAddr);

        shop.registerType(0.001 ether, 200 ether,  string.concat(baseUri, "/1"), 0,   "",                        0);
        shop.registerType(0.002 ether, 400 ether,  string.concat(baseUri, "/2"), 0,   "",                        0);
        shop.registerType(0.01  ether, 0,          string.concat(baseUri, "/3"), 100, "relm_core:pick_wood",     UNBREAKABLE | KEEP_ON_DEATH | SOULBOUND);
        shop.registerType(0,           1500 ether, string.concat(baseUri, "/4"), 0,   "relm_core:pick_iron",     KEEP_ON_DEATH);
        shop.registerType(0,           300 ether,  string.concat(baseUri, "/5"), 0,   "relm_core:axe_wood",      0);

        vm.stopBroadcast();
        console2.log("RelmCosmetic v2 deployed at", address(shop));
    }
}
