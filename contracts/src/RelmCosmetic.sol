// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Relm Cosmetic NFTs
/// @notice ERC-721 cosmetic items players buy with native ETH on
///         Soneium. Owner pre-registers "cosmetic types" (cape, skin,
///         particle effect, pickaxe skin) with a price + metadata URI;
///         players then mint instances of a type by paying that price.
///
///         Each minted NFT records which type it represents, so the
///         game's Lua mod can render the right cosmetic when a player
///         joins (server queries the contract via the backend, finds
///         which types the player owns, applies them).
///
///         Revenue accrues in this contract until `withdraw` drains it
///         to the treasury. Keeping ETH on the contract instead of
///         streaming to the owner means failed withdrawals don't lose
///         funds (they just sit safely until the next attempt).
contract RelmCosmetic is ERC721, Ownable {
    struct CosmeticType {
        uint256 priceWei;
        bool active;
        string metadataURI;
        uint256 maxSupply; // 0 = unlimited
        uint256 minted;
    }

    mapping(uint256 => CosmeticType) public cosmeticTypes;
    mapping(uint256 => uint256) public tokenIdToType;

    uint256 public nextTypeId = 1;
    uint256 public nextTokenId = 1;

    event TypeRegistered(uint256 indexed typeId, uint256 priceWei, uint256 maxSupply, string metadataURI);
    event TypeUpdated(uint256 indexed typeId, uint256 priceWei, bool active, string metadataURI);
    event Minted(uint256 indexed tokenId, uint256 indexed typeId, address indexed to, uint256 paid);
    event Withdrawn(address indexed to, uint256 amount);

    error TypeInactive(uint256 typeId);
    error TypeUnknown(uint256 typeId);
    error WrongPayment(uint256 expected, uint256 sent);
    error SupplyExhausted(uint256 typeId);
    error WithdrawFailed();

    constructor() ERC721("Relm Cosmetic", "RCOS") Ownable(msg.sender) {}

    function registerType(
        uint256 priceWei,
        string calldata metadataURI,
        uint256 maxSupply
    ) external onlyOwner returns (uint256 typeId) {
        typeId = nextTypeId++;
        cosmeticTypes[typeId] = CosmeticType({
            priceWei: priceWei,
            active: true,
            metadataURI: metadataURI,
            maxSupply: maxSupply,
            minted: 0
        });
        emit TypeRegistered(typeId, priceWei, maxSupply, metadataURI);
    }

    function updateType(
        uint256 typeId,
        uint256 priceWei,
        bool active,
        string calldata metadataURI
    ) external onlyOwner {
        if (cosmeticTypes[typeId].priceWei == 0 && bytes(cosmeticTypes[typeId].metadataURI).length == 0) {
            revert TypeUnknown(typeId);
        }
        cosmeticTypes[typeId].priceWei = priceWei;
        cosmeticTypes[typeId].active = active;
        cosmeticTypes[typeId].metadataURI = metadataURI;
        emit TypeUpdated(typeId, priceWei, active, metadataURI);
    }

    function mint(uint256 typeId) external payable returns (uint256 tokenId) {
        CosmeticType storage t = cosmeticTypes[typeId];
        if (bytes(t.metadataURI).length == 0) revert TypeUnknown(typeId);
        if (!t.active) revert TypeInactive(typeId);
        if (msg.value != t.priceWei) revert WrongPayment(t.priceWei, msg.value);
        if (t.maxSupply != 0 && t.minted >= t.maxSupply) revert SupplyExhausted(typeId);

        tokenId = nextTokenId++;
        t.minted += 1;
        tokenIdToType[tokenId] = typeId;
        _safeMint(msg.sender, tokenId);
        emit Minted(tokenId, typeId, msg.sender, msg.value);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return cosmeticTypes[tokenIdToType[tokenId]].metadataURI;
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        (bool ok, ) = to.call{ value: amount }("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    receive() external payable {}
}
