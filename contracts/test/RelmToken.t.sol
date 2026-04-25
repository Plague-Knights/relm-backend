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

    uint256 constant CAP = 100_000_000 * 1e18; // 100M RELM

    function setUp() public {
        vm.prank(owner);
        token = new RelmToken(minter, CAP);
    }

    function test_constructor_setsCap() public view {
        assertEq(token.MAX_SUPPLY(), CAP);
        assertEq(token.remainingMintable(), CAP);
    }

    function test_constructor_zeroCapReverts() public {
        vm.expectRevert(RelmToken.InvalidCap.selector);
        new RelmToken(minter, 0);
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

    function test_mint_revertsAtCap() public {
        // Mint up to one wei below the cap.
        vm.prank(minter);
        token.mint(alice, CAP - 1);
        assertEq(token.totalSupply(), CAP - 1);
        assertEq(token.remainingMintable(), 1);

        // One more wei is fine.
        vm.prank(minter);
        token.mint(alice, 1);
        assertEq(token.totalSupply(), CAP);
        assertEq(token.remainingMintable(), 0);

        // Anything beyond reverts cleanly.
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(RelmToken.CapExceeded.selector, CAP + 1, CAP));
        token.mint(alice, 1);
    }

    function test_mintBatch_revertsAtCap() public {
        // First, mint everything but 5 wei.
        vm.prank(minter);
        token.mint(alice, CAP - 5);

        address[] memory to = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        to[0] = alice; to[1] = bob;
        amounts[0] = 3; amounts[1] = 4; // total 7, but only 5 left

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(RelmToken.CapExceeded.selector, CAP + 2, CAP));
        token.mintBatch(to, amounts);

        // Confirm the failed batch wasn't partially applied.
        assertEq(token.balanceOf(alice), CAP - 5);
        assertEq(token.balanceOf(bob),   0);
    }

    function test_burnReducesSupply_andFreesHeadroom() public {
        // Mint to cap, then burn — remainingMintable should reflect headroom.
        vm.prank(minter);
        token.mint(alice, CAP);
        assertEq(token.remainingMintable(), 0);

        vm.prank(alice);
        token.burn(1e18);
        assertEq(token.totalSupply(), CAP - 1e18);
        assertEq(token.remainingMintable(), 1e18);

        // Minter can fill the headroom back in.
        vm.prank(minter);
        token.mint(bob, 1e18);
        assertEq(token.totalSupply(), CAP);
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
