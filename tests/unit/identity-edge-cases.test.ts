import { describe, it, expect } from "vitest";
import { generateKeyPair, sign, verify, extractPublicKeyFromDID } from "@/services/identity/did";
import { issueCredential, verifyCredential } from "@/services/identity/credentials";
import { exportIdentity, verifyIdentityPackage } from "@/services/identity/export";
import { resolveDID, isValidDID } from "@/services/identity/resolver";
import type { VerifiableCredential } from "@/types/identity";

describe("Identity — Edge Cases", () => {
  describe("DID Key Extraction", () => {
    it("rejects did:key without z prefix", () => {
      expect(() => extractPublicKeyFromDID("did:key:abc")).toThrow("base58btc");
    });

    it("rejects empty DID", () => {
      expect(() => extractPublicKeyFromDID("")).toThrow();
    });

    it("rejects did:web", () => {
      expect(() => extractPublicKeyFromDID("did:web:example.com")).toThrow("Only did:key");
    });
  });

  describe("Signature — Boundary Inputs", () => {
    it("signs empty payload", async () => {
      const kp = await generateKeyPair();
      const sig = await sign(new Uint8Array(0), kp.privateKey);
      expect(sig).toBeInstanceOf(Uint8Array);
      expect(sig.length).toBe(64);
      const valid = await verify(sig, new Uint8Array(0), kp.publicKey);
      expect(valid).toBe(true);
    });

    it("signs large payload (1MB)", async () => {
      const kp = await generateKeyPair();
      const large = new Uint8Array(1_000_000).fill(42);
      const sig = await sign(large, kp.privateKey);
      const valid = await verify(sig, large, kp.publicKey);
      expect(valid).toBe(true);
    });

    it("rejects signature with corrupted byte", async () => {
      const kp = await generateKeyPair();
      const payload = new TextEncoder().encode("test");
      const sig = await sign(payload, kp.privateKey);
      const corrupted = new Uint8Array(sig);
      corrupted[0] = corrupted[0]! ^ 0xff;
      const valid = await verify(corrupted, payload, kp.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects truncated signature", async () => {
      const kp = await generateKeyPair();
      const payload = new TextEncoder().encode("test");
      const sig = await sign(payload, kp.privateKey);
      const truncated = sig.slice(0, 32);
      // Ed25519 should reject wrong-length signatures
      await expect(verify(truncated, payload, kp.publicKey)).rejects.toThrow();
    });
  });

  describe("Credential — Invalid Input", () => {
    it("rejects credential with non-did:key issuer", async () => {
      const cred: VerifiableCredential = {
        "@context": [],
        type: ["VerifiableCredential"],
        issuer: "did:web:example.com",
        issuanceDate: new Date().toISOString(),
        credentialSubject: { id: "did:web:example.com" },
        proof: {
          type: "Ed25519Signature2020",
          verificationMethod: "did:web:example.com#key",
          created: new Date().toISOString(),
          proofValue: "aW52YWxpZA==",
        },
      };
      const result = await verifyCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot extract public key");
    });

    it("rejects credential with invalid base64 proof", async () => {
      const kp = await generateKeyPair();
      const cred: VerifiableCredential = {
        "@context": [],
        type: ["VerifiableCredential"],
        issuer: kp.did,
        issuanceDate: new Date().toISOString(),
        credentialSubject: { id: kp.did },
        proof: {
          type: "Ed25519Signature2020",
          verificationMethod: `${kp.did}#key`,
          created: new Date().toISOString(),
          proofValue: "!!!not-base64!!!",
        },
      };
      const result = await verifyCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("base64");
    });

    it("rejects credential signed by different key", async () => {
      const kp1 = await generateKeyPair();
      const kp2 = await generateKeyPair();

      // Issue with kp1
      const cred = await issueCredential(
        kp1.did,
        kp1.did,
        "TestCred",
        { value: 1 },
        kp1.privateKey,
        kp1.publicKeyMultibase,
      );

      // Change issuer to kp2 (so verification uses kp2 public key)
      cred.issuer = kp2.did;
      const result = await verifyCredential(cred);
      expect(result.valid).toBe(false);
    });
  });

  describe("Identity Package — Invalid Input", () => {
    it("rejects package with invalid base64 proof", async () => {
      const kp = await generateKeyPair();
      const pkg = await exportIdentity(
        kp.did,
        kp.publicKeyMultibase,
        kp.privateKey,
        { displayName: "A", agentId: "a", platforms: [] },
        [],
        [],
        [],
      );
      pkg.proof.proofValue = "!!!invalid!!!";
      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("base64");
    });

    it("rejects package with modified capabilities", async () => {
      const kp = await generateKeyPair();
      const pkg = await exportIdentity(
        kp.did,
        kp.publicKeyMultibase,
        kp.privateKey,
        { displayName: "A", agentId: "a", platforms: [] },
        [],
        [],
        ["publish"],
      );
      pkg.capabilities.push("admin"); // tamper
      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(false);
    });

    it("rejects package with swapped DID", async () => {
      const kp1 = await generateKeyPair();
      const kp2 = await generateKeyPair();
      const pkg = await exportIdentity(
        kp1.did,
        kp1.publicKeyMultibase,
        kp1.privateKey,
        { displayName: "A", agentId: "a", platforms: [] },
        [],
        [],
        [],
      );
      pkg.did = kp2.did; // swap DID
      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(false);
    });

    it("verifies package with empty credentials and topics", async () => {
      const kp = await generateKeyPair();
      const pkg = await exportIdentity(
        kp.did,
        kp.publicKeyMultibase,
        kp.privateKey,
        { displayName: "A", agentId: "a", platforms: [] },
        [],
        [],
        [],
      );
      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(true);
    });
  });

  describe("DID Resolver — Edge Cases", () => {
    it("resolves and validates round-trip", async () => {
      const kp = await generateKeyPair();
      const doc = resolveDID(kp.did);
      expect(doc.verificationMethod[0]!.publicKeyMultibase).toBe(kp.publicKeyMultibase);

      // Extract key from resolved doc and verify a signature
      const pubKey = extractPublicKeyFromDID(doc.id);
      const payload = new TextEncoder().encode("hello");
      const sig = await sign(payload, kp.privateKey);
      expect(await verify(sig, payload, pubKey)).toBe(true);
    });

    it("isValidDID returns false for truncated did:key", () => {
      expect(isValidDID("did:key:z")).toBe(false);
    });

    it("isValidDID returns false for empty string", () => {
      expect(isValidDID("")).toBe(false);
    });
  });
});
