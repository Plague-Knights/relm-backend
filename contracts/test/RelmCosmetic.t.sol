// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RelmCosmetic } from "../src/RelmCosmetic.sol";
import { RelmToken } from "../src/RelmToken.sol";

contract RelmCosmeticTest is Test {
    RelmCosmetic shop;
    RelmToken token;
    address owner = makeAddr("owner");
    address minter = makeAddr("minter");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    address treasury = makeAddr("treasury");

    function setUp() public {
        vm.prank(owner);
        token = new RelmToken(minter, 100_000_000 * 1e18);
        vm.prank(owner);
        shop = new RelmCosmetic(address(token));
        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);
        // Top alice up with RELM so she can buy with the soft currency too.
        vm.prank(minter);
        token.mint(alice, 1_000 ether);
    }

    function test_registerAndMintWithEth() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://cape-red.json", 0, "", 0);
        assertEq(tid, 1);

        vm.prank(alice);
        uint256 token1 = shop.mint{ value: 0.01 ether }(tid);
        assertEq(shop.ownerOf(token1), alice);
        assertEq(address(shop).balance, 0.01 ether);
    }

    function test_mintWithRelmBurnsTokens() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0, 50 ether, "ipfs://relm-only.json", 0, "", 0);

        vm.prank(alice);
        token.approve(address(shop), 50 ether);
        vm.prank(alice);
        uint256 nft = shop.mintWithRelm(tid);

        assertEq(shop.ownerOf(nft), alice);
        assertEq(token.balanceOf(alice), 950 ether);
        assertEq(token.balanceOf(0x000000000000000000000000000000000000dEaD), 50 ether);
    }

    function test_mintWithRelmRevertsIfDisabled() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://eth-only.json", 0, "", 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.RelmPaymentDisabled.selector, tid));
        shop.mintWithRelm(tid);
    }

    function test_perksStoredAndReadable() public {
        uint16 unb = shop.PERK_UNBREAKABLE();
        uint16 kod = shop.PERK_KEEP_ON_DEATH();
        uint16 soul = shop.PERK_SOULBOUND();
        uint16 perks = unb | kod | soul;

        vm.prank(owner);
        uint256 tid = shop.registerType(0.05 ether, 0, "ipfs://founder.json", 100, "relm_core:pick_wood", perks);

        (uint256 priceWei, uint256 priceRelm, bool active, string memory uri, uint256 maxSupply, uint256 minted, string memory itemId, uint16 storedPerks) = shop.cosmeticTypes(tid);
        assertEq(priceWei, 0.05 ether);
        assertEq(priceRelm, 0);
        assertTrue(active);
        assertEq(uri, "ipfs://founder.json");
        assertEq(maxSupply, 100);
        assertEq(minted, 0);
        assertEq(itemId, "relm_core:pick_wood");
        assertEq(storedPerks, perks);
    }

    function test_soulboundBlocksTransfer() public {
        uint16 perks = shop.PERK_SOULBOUND();
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://x", 0, "relm_core:pick_wood", perks);

        vm.prank(alice);
        uint256 nft = shop.mint{ value: 0.01 ether }(tid);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.SoulboundTransfer.selector, nft));
        shop.transferFrom(alice, bob, nft);
    }

    function test_nonSoulboundTransfersFreely() public {
        uint16 perks = shop.PERK_UNBREAKABLE();
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://x", 0, "", perks);

        vm.prank(alice);
        uint256 nft = shop.mint{ value: 0.01 ether }(tid);

        vm.prank(alice);
        shop.transferFrom(alice, bob, nft);
        assertEq(shop.ownerOf(nft), bob);
    }

    function test_wrongEthPaymentReverts() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.05 ether, 0, "ipfs://x", 0, "", 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.WrongPayment.selector, 0.05 ether, 0.04 ether));
        shop.mint{ value: 0.04 ether }(tid);
    }

    function test_inactiveTypeReverts() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://x", 0, "", 0);
        vm.prank(owner);
        shop.updateType(tid, 0.01 ether, 0, false, "ipfs://x", "", 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.TypeInactive.selector, tid));
        shop.mint{ value: 0.01 ether }(tid);
    }

    function test_supplyCap() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://limited", 2, "", 0);

        vm.prank(alice); shop.mint{ value: 0.01 ether }(tid);
        vm.prank(bob);   shop.mint{ value: 0.01 ether }(tid);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.SupplyExhausted.selector, tid));
        shop.mint{ value: 0.01 ether }(tid);
    }

    function test_withdrawEth() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, 0, "ipfs://x", 0, "", 0);
        vm.prank(alice); shop.mint{ value: 0.01 ether }(tid);

        uint256 before_ = treasury.balance;
        vm.prank(owner);
        shop.withdraw(payable(treasury), 0.01 ether);
        assertEq(treasury.balance - before_, 0.01 ether);
        assertEq(address(shop).balance, 0);
    }

    function test_unknownTypeReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.TypeUnknown.selector, 99));
        shop.mint{ value: 0.01 ether }(99);
    }

    function test_onlyOwnerCanRegister() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.registerType(0.01 ether, 0, "ipfs://x", 0, "", 0);
    }
}
