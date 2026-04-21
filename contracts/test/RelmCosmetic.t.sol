// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RelmCosmetic } from "../src/RelmCosmetic.sol";

contract RelmCosmeticTest is Test {
    RelmCosmetic shop;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    address treasury = makeAddr("treasury");

    function setUp() public {
        vm.prank(owner);
        shop = new RelmCosmetic();
        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);
    }

    function test_registerAndMint() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, "ipfs://cape-red.json", 0);
        assertEq(tid, 1);

        vm.prank(alice);
        uint256 token = shop.mint{ value: 0.01 ether }(tid);
        assertEq(shop.ownerOf(token), alice);
        assertEq(shop.tokenURI(token), "ipfs://cape-red.json");
        assertEq(address(shop).balance, 0.01 ether);
    }

    function test_wrongPaymentReverts() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.05 ether, "ipfs://x", 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.WrongPayment.selector, 0.05 ether, 0.04 ether));
        shop.mint{ value: 0.04 ether }(tid);
    }

    function test_inactiveTypeReverts() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, "ipfs://x", 0);
        vm.prank(owner);
        shop.updateType(tid, 0.01 ether, false, "ipfs://x");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.TypeInactive.selector, tid));
        shop.mint{ value: 0.01 ether }(tid);
    }

    function test_supplyCap() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, "ipfs://limited", 2);

        vm.prank(alice); shop.mint{ value: 0.01 ether }(tid);
        vm.prank(bob);   shop.mint{ value: 0.01 ether }(tid);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmCosmetic.SupplyExhausted.selector, tid));
        shop.mint{ value: 0.01 ether }(tid);
    }

    function test_withdraw() public {
        vm.prank(owner);
        uint256 tid = shop.registerType(0.01 ether, "ipfs://x", 0);
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
        shop.registerType(0.01 ether, "ipfs://x", 0);
    }
}
