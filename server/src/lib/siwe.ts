import { SiweMessage, generateNonce } from "siwe";
import { publicClient } from "./chain.js";

const CHALLENGE_TTL_MINUTES = 10;

export function freshChallenge(player: string, domain: string, uri: string) {
  const nonce = generateNonce();
  const message = new SiweMessage({
    domain,
    address: "0x0000000000000000000000000000000000000000", // filled by wallet before signing
    statement: `Link ${player} to your Soneium wallet on Relm.`,
    uri,
    version: "1",
    chainId: 1946,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000).toISOString(),
  });
  return {
    nonce,
    message: message.prepareMessage(),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
  };
}

// Verify the signature, cross-check the nonce, return the recovered
// address. Uses viem's EIP-1271 fallback so smart-contract wallets work
// too — matches how ink-bird verifies SIWE.
export async function verifyChallenge(rawMessage: string, signature: `0x${string}`, expectedNonce: string) {
  const msg = new SiweMessage(rawMessage);
  if (msg.nonce !== expectedNonce) throw new Error("nonce mismatch");
  const ok = await publicClient.verifySiweMessage({ message: rawMessage, signature });
  if (!ok) throw new Error("invalid signature");
  return msg.address as `0x${string}`;
}
