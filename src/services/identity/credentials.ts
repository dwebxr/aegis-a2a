import type { VerifiableCredential, CredentialProof } from "@/types/identity";
import { sign, verify, extractPublicKeyFromDID } from "./did";
import { bytesToBase64, base64ToBytes } from "./encoding";

const CONTEXT = [
  "https://www.w3.org/2018/credentials/v1",
  "https://aegis.dwebxr.xyz/ns/a2a/v1",
];

export async function issueCredential(
  issuerDid: string,
  subjectDid: string,
  credentialType: string,
  claims: Record<string, unknown>,
  privateKey: Uint8Array,
  publicKeyMultibase: string,
): Promise<VerifiableCredential> {
  const unsignedCredential: VerifiableCredential = {
    "@context": CONTEXT,
    type: ["VerifiableCredential", credentialType],
    issuer: issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: subjectDid, ...claims },
  };

  const payload = new TextEncoder().encode(JSON.stringify(unsignedCredential));
  const signature = await sign(payload, privateKey);

  const proof: CredentialProof = {
    type: "Ed25519Signature2020",
    verificationMethod: `${issuerDid}#${publicKeyMultibase}`,
    created: new Date().toISOString(),
    proofValue: bytesToBase64(signature),
  };

  return { ...unsignedCredential, proof };
}

export async function verifyCredential(
  credential: VerifiableCredential,
): Promise<{ valid: boolean; error?: string }> {
  if (!credential.proof) {
    return { valid: false, error: "No proof found" };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = extractPublicKeyFromDID(credential.issuer);
  } catch (err) {
    return {
      valid: false,
      error: `Cannot extract public key from issuer DID: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { proof, ...unsignedCredential } = credential;
  const payload = new TextEncoder().encode(JSON.stringify(unsignedCredential));

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
