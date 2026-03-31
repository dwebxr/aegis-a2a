import * as ed from "@noble/ed25519";
import { base58btc } from "multiformats/bases/base58";
import type { AgentDID, DIDDocument } from "@/types/identity";

// Multicodec prefix for Ed25519 public key: 0xed, 0x01
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

export async function generateKeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  did: string;
  publicKeyMultibase: string;
}> {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  // Multicodec-encode: prefix + raw public key
  const multicodec = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length);
  multicodec.set(ED25519_MULTICODEC_PREFIX);
  multicodec.set(publicKey, ED25519_MULTICODEC_PREFIX.length);

  // Base58btc-encode with 'z' prefix (multibase standard)
  const publicKeyMultibase = base58btc.encode(multicodec);
  const did = `did:key:${publicKeyMultibase}`;

  return { publicKey, privateKey, did, publicKeyMultibase };
}

export function createAgentDID(did: string, publicKeyMultibase: string): AgentDID {
  return { did, publicKeyMultibase, created: Date.now() };
}

/** Builds a W3C DID Document following Ed25519VerificationKey2020 spec */
export function buildDIDDocument(did: string, publicKeyMultibase: string): DIDDocument {
  const keyId = `${did}#${publicKeyMultibase}`;
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id: did,
    verificationMethod: [
      { id: keyId, type: "Ed25519VerificationKey2020", controller: did, publicKeyMultibase },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
  };
}

export async function sign(payload: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  return ed.signAsync(payload, privateKey);
}

export async function verify(signature: Uint8Array, payload: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  return ed.verifyAsync(signature, payload, publicKey);
}

export function extractPublicKeyFromDID(did: string): Uint8Array {
  if (!did.startsWith("did:key:z")) {
    throw new Error("Only did:key with base58btc encoding (z prefix) is supported");
  }

  const multibase = did.slice("did:key:".length);
  const decoded = base58btc.decode(multibase);

  // Strip multicodec prefix (2 bytes for Ed25519)
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("Unsupported key type in did:key (expected Ed25519)");
  }

  return decoded.slice(2);
}
