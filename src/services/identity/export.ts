import type {
  IdentityPackage,
  AgentProfile,
  VerifiableCredential,
  CredentialProof,
} from "@/types/identity";
import { sign, extractPublicKeyFromDID, verify } from "./did";
import { bytesToBase64, base64ToBytes } from "./encoding";

/** Builds a signed, portable identity bundle (DID + profile + credentials) */
export async function exportIdentity(
  did: string,
  publicKeyMultibase: string,
  privateKey: Uint8Array,
  profile: AgentProfile,
  credentials: VerifiableCredential[],
  topics: string[],
  capabilities: string[],
): Promise<IdentityPackage> {
  const unsignedPackage = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://aegis.dwebxr.xyz/ns/a2a/v1",
    ] as IdentityPackage["@context"],
    did,
    created: new Date().toISOString(),
    profile,
    credentials,
    preferences: { topics },
    capabilities,
  };

  const payload = new TextEncoder().encode(JSON.stringify(unsignedPackage));
  const signature = await sign(payload, privateKey);

  const proof: CredentialProof = {
    type: "Ed25519Signature2020",
    verificationMethod: `${did}#${publicKeyMultibase}`,
    created: new Date().toISOString(),
    proofValue: bytesToBase64(signature),
  };

  return { ...unsignedPackage, proof };
}

export async function verifyIdentityPackage(
  pkg: IdentityPackage,
): Promise<{ valid: boolean; error?: string }> {
  if (!pkg.proof) {
    return { valid: false, error: "No proof found" };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = extractPublicKeyFromDID(pkg.did);
  } catch (err) {
    return {
      valid: false,
      error: `Cannot extract public key: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { proof, ...unsignedPackage } = pkg;
  const payload = new TextEncoder().encode(JSON.stringify(unsignedPackage));

  let signature: Uint8Array;
  try {
    signature = base64ToBytes(proof.proofValue);
  } catch {
    return { valid: false, error: "Malformed proof value (invalid base64)" };
  }

  try {
    const valid = await verify(signature, payload, publicKey);
    return { valid };
  } catch {
    return { valid: false, error: "Signature verification failed" };
  }
}
