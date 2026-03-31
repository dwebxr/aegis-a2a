import type { DIDDocument } from "@/types/identity";
import { buildDIDDocument, extractPublicKeyFromDID } from "./did";

// did:key is self-describing — the document is derived from the DID itself
export function resolveDID(did: string): DIDDocument {
  if (!did.startsWith("did:key:z")) {
    throw new Error("Only did:key with base58btc encoding is supported");
  }
  const publicKeyMultibase = did.slice("did:key:".length);
  extractPublicKeyFromDID(did); // validate key is extractable
  return buildDIDDocument(did, publicKeyMultibase);
}

export function isValidDID(did: string): boolean {
  try {
    if (!did.startsWith("did:key:z")) return false;
    extractPublicKeyFromDID(did);
    return true;
  } catch {
    return false;
  }
}
