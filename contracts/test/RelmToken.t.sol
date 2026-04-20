// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RelmToken } from "../src/RelmToken.sol";

contract RelmTokenTest is Test {
    RelmToken token;
    address owner  = makeAddr("owner");
    address minter = makeAddr("minter");
    address alice  = makeAddr("alice");
    address bob    = makeAddr("bob");

    function setUp() public {
        vm.prank(owner);
        token = new RelmToken(minter);
    }

    function test_onlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RelmToken.NotMinter.selector, alice));
        token.mint(alice, 1e18);

        vm.prank(minter);
        token.mint(alice, 5e18);
        assertEq(token.balanceOf(alice), 5e18);
    }

    function test_mintBatch() public {
        address[] memory to = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        to[0] = alice; to[1] = bob;
        amounts[0] = 1e18; amounts[1] = 2e18;

        vm.prank(minter);
        token.mintBatch(to, amounts);

        assertEq(token.balanceOf(alice), 1e18);
        assertEq(token.balanceOf(bob),   2e18);
    }

    function test_rotateMinter_onlyOwner() public {
        address newMinter = makeAddr("newMinter");

        vm.prank(alice);
        vm.expectRevert();
        token.rotateMinter(newMinter);

        vm.prank(owner);
        token.rotateMinter(newMinter);
        assertEq(token.minter(), newMinter);

        // old minter loses the right
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(RelmToken.NotMinter.selector, minter));
        token.mint(alice, 1);

        // new minter can now mint
        vm.prank(newMinter);
        token.mint(alice, 7);
        assertEq(token.balanceOf(alice), 7);
    }
}
