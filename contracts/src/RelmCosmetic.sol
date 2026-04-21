// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRelmToken is IERC20 {
    // RelmToken doesn't expose burn() directly — we route to the
    // dead address instead, which is functionally equivalent and
    // doesn't require the token to support a burn extension.
}

/// @title Relm Cosmetic NFTs (v2)
/// @notice ERC-721 cosmetic + utility items players buy with native ETH on
///         Soneium. Each "type" is registered by the owner with:
///         - priceWei  / metadataURI / maxSupply (commerce)
///         - itemId    (which game item this skins, empty string = pure accessory)
///         - perks     (bitmask of convenience perks the in-game mod enforces)
///
///         Perks are deliberately convenience-only: unbreakable, keep on death,
///         soulbound, auto-pickup. NOT extra damage / faster mining / exclusive
///         drops — that would be pay-to-win and would drive off free players.
///
///         The in-game `relm_cosmetics` mod reads owned NFTs via the backend
///         and applies perks + visuals at runtime. The contract is the source
///         of truth for which perks each type carries.
contract RelmCosmetic is ERC721, Ownable {
    // Perks bitmask values. The Lua mod mirrors these constants.
    uint16 public constant PERK_UNBREAKABLE   = 1 << 0;
    uint16 public constant PERK_KEEP_ON_DEATH = 1 << 1;
    uint16 public constant PERK_SOULBOUND     = 1 << 2;
    uint16 public constant PERK_AUTO_PICKUP   = 1 << 3;

    struct CosmeticType {
        uint256 priceWei;
        uint256 priceRelm;   // 0 = not purchasable with RELM
        bool active;
        string metadataURI;
        uint256 maxSupply;   // 0 = unlimited
        uint256 minted;
        string itemId;       // game item id this skins, e.g. "relm_core:pick_wood" — empty means pure accessory
        uint16 perks;        // bitmask of PERK_* values
    }

    // Address of the RelmToken contract. Set once at construction.
    IRelmToken public immutable relmToken;
    // Spent RELM gets sent here — functionally a burn (nothing reads
    // from this address). We don't call a burn() extension because
    // RelmToken intentionally doesn't ship one; this keeps both
    // contracts minimal and the deflation accounting trivial.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    mapping(uint256 => CosmeticType) public cosmeticTypes;
    mapping(uint256 => uint256) public tokenIdToType;

    uint256 public nextTypeId = 1;
    uint256 public nextTokenId = 1;

    event TypeRegistered(uint256 indexed typeId, uint256 priceWei, uint256 priceRelm, uint256 maxSupply, string metadataURI, string itemId, uint16 perks);
    event TypeUpdated(uint256 indexed typeId, uint256 priceWei, uint256 priceRelm, bool active, string metadataURI, string itemId, uint16 perks);
    event Minted(uint256 indexed tokenId, uint256 indexed typeId, address indexed to, uint256 paidWei, uint256 paidRelm);
    event Withdrawn(address indexed to, uint256 amount);

    error TypeInactive(uint256 typeId);
    error TypeUnknown(uint256 typeId);
    error WrongPayment(uint256 expected, uint256 sent);
    error RelmPaymentDisabled(uint256 typeId);
    error RelmTransferFailed();
    error SupplyExhausted(uint256 typeId);
    error WithdrawFailed();
    error SoulboundTransfer(uint256 tokenId);

    constructor(address relmTokenAddr) ERC721("Relm Cosmetic", "RCOS") Ownable(msg.sender) {
        relmToken = IRelmToken(relmTokenAddr);
    }

    function registerType(
        uint256 priceWei,
        uint256 priceRelm,
        string calldata metadataURI,
        uint256 maxSupply,
        string calldata itemId,
        uint16 perks
    ) external onlyOwner returns (uint256 typeId) {
        typeId = nextTypeId++;
        cosmeticTypes[typeId] = CosmeticType({
            priceWei: priceWei,
            priceRelm: priceRelm,
            active: true,
            metadataURI: metadataURI,
            maxSupply: maxSupply,
            minted: 0,
            itemId: itemId,
            perks: perks
        });
        emit TypeRegistered(typeId, priceWei, priceRelm, maxSupply, metadataURI, itemId, perks);
    }

    function updateType(
        uint256 typeId,
        uint256 priceWei,
        uint256 priceRelm,
        bool active,
        string calldata metadataURI,
        string calldata itemId,
        uint16 perks
    ) external onlyOwner {
        CosmeticType storage t = cosmeticTypes[typeId];
        if (bytes(t.metadataURI).length == 0) revert TypeUnknown(typeId);
        t.priceWei = priceWei;
        t.priceRelm = priceRelm;
        t.active = active;
        t.metadataURI = metadataURI;
        t.itemId = itemId;
        t.perks = perks;
        emit TypeUpdated(typeId, priceWei, priceRelm, active, metadataURI, itemId, perks);
    }

    /// Pay with native ETH on Soneium.
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
        emit Minted(tokenId, typeId, msg.sender, msg.value, 0);
    }

    /// Pay with RELM tokens. Requires the caller to `approve` this
    /// contract for at least `priceRelm` first. Tokens are sent to the
    /// dead address — functionally a burn, deflationary by design.
    function mintWithRelm(uint256 typeId) external returns (uint256 tokenId) {
        CosmeticType storage t = cosmeticTypes[typeId];
        if (bytes(t.metadataURI).length == 0) revert TypeUnknown(typeId);
        if (!t.active) revert TypeInactive(typeId);
        if (t.priceRelm == 0) revert RelmPaymentDisabled(typeId);
        if (t.maxSupply != 0 && t.minted >= t.maxSupply) revert SupplyExhausted(typeId);

        bool ok = relmToken.transferFrom(msg.sender, DEAD, t.priceRelm);
        if (!ok) revert RelmTransferFailed();

        tokenId = nextTokenId++;
        t.minted += 1;
        tokenIdToType[tokenId] = typeId;
        _safeMint(msg.sender, tokenId);
        emit Minted(tokenId, typeId, msg.sender, 0, t.priceRelm);
    }

    /// On-chain enforcement of the SOULBOUND perk. We override
    /// `_update` (OZ v5 transfer hook) — mints (from = 0) and burns
    /// (to = 0) are allowed; transfers between non-zero addresses on a
    /// soulbound type revert.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            uint256 typeId = tokenIdToType[tokenId];
            if ((cosmeticTypes[typeId].perks & PERK_SOULBOUND) != 0) {
                revert SoulboundTransfer(tokenId);
            }
        }
        return super._update(to, tokenId, auth);
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
