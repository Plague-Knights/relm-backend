// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RelmEnergyRefill } from "../src/RelmEnergyRefill.sol";
import { RelmToken } from "../src/RelmToken.sol";

contract RelmEnergyRefillTest is Test {
    RelmEnergyRefill refill;
    RelmToken token;
    address owner  = makeAddr("owner");
    address minter = makeAddr("minter");
    address alice  = makeAddr("alice");

    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        vm.prank(owner);
        token = new RelmToken(minter);
        vm.prank(owner);
        refill = new RelmEnergyRefill(address(token), 50 ether, 100);

        vm.prank(minter);
        token.mint(alice, 1000 ether);
    }

    function test_refillBurnsAndEmits() public {
        vm.prank(alice);
        token.approve(address(refill), 50 ether);

        vm.expectEmit(true, false, false, true);
        emit RelmEnergyRefill.Refilled(alice, 100, 50 ether);
        vm.prank(alice);
        refill.refill();

        assertEq(token.balanceOf(alice), 950 ether);
        assertEq(token.balanceOf(DEAD), 50 ether);
    }

    function test_refillRevertsWithoutApproval() public {
        vm.prank(alice);
        vm.expectRevert();
        refill.refill();
    }

    function test_setPriceOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        refill.setPrice(75 ether, 150);

        vm.prank(owner);
        refill.setPrice(75 ether, 150);
        assertEq(refill.refillPrice(), 75 ether);
        assertEq(refill.refillAmount(), 150);
    }
}
