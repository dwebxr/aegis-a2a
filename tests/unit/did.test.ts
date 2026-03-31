import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  createAgentDID,
  buildDIDDocument,
  sign,
  verify,
  extractPublicKeyFromDID,
} from "@/services/identity/did";

describe("DID Service", () => {
  describe("generateKeyPair", () => {
    it("generates valid key pair with did:key", async () => {
      const kp = await generateKeyPair();

      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.privateKey.length).toBe(32);
      expect(kp.did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
      expect(kp.publicKeyMultibase).toMatch(/^z[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it("generates unique key pairs", async () => {
      const kp1 = await generateKeyPair();
      const kp2 = await generateKeyPair();
      expect(kp1.did).not.toBe(kp2.did);
    });
  });

  describe("createAgentDID", () => {
    it("creates AgentDID with timestamp", () => {
      const agentDid = createAgentDID("did:key:z6Mktest", "z6Mktest");
      expect(agentDid.did).toBe("did:key:z6Mktest");
      expect(agentDid.publicKeyMultibase).toBe("z6Mktest");
      expect(agentDid.created).toBeGreaterThan(0);
    });
  });

  describe("buildDIDDocument", () => {
    it("builds valid DID Document", () => {
      const doc = buildDIDDocument("did:key:z6MkTest", "z6MkTest");

      expect(doc["@context"]).toContain("https://www.w3.org/ns/did/v1");
      expect(doc.id).toBe("did:key:z6MkTest");
      expect(doc.verificationMethod).toHaveLength(1);
      expect(doc.verificationMethod[0]!.type).toBe("Ed25519VerificationKey2020");
      expect(doc.verificationMethod[0]!.controller).toBe("did:key:z6MkTest");
      expect(doc.authentication).toHaveLength(1);
      expect(doc.assertionMethod).toHaveLength(1);
    });
  });

  describe("sign and verify", () => {
    it("signs and verifies a payload", async () => {
      const kp = await generateKeyPair();
      const payload = new TextEncoder().encode("hello world");

      const signature = await sign(payload, kp.privateKey);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // Ed25519 signatures are 64 bytes

      const valid = await verify(signature, payload, kp.publicKey);
      expect(valid).toBe(true);
    });

    it("rejects tampered payload", async () => {
      const kp = await generateKeyPair();
      const payload = new TextEncoder().encode("original");
      const signature = await sign(payload, kp.privateKey);

      const tampered = new TextEncoder().encode("tampered");
      const valid = await verify(signature, tampered, kp.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects wrong public key", async () => {
      const kp1 = await generateKeyPair();
      const kp2 = await generateKeyPair();
      const payload = new TextEncoder().encode("test");
      const signature = await sign(payload, kp1.privateKey);

      const valid = await verify(signature, payload, kp2.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe("extractPublicKeyFromDID", () => {
    it("round-trips through generateKeyPair", async () => {
      const kp = await generateKeyPair();
      const extracted = extractPublicKeyFromDID(kp.did);
      expect(extracted).toEqual(kp.publicKey);
    });

    it("throws for non did:key", () => {
      expect(() => extractPublicKeyFromDID("did:web:example.com")).toThrow(
        "Only did:key",
      );
    });

    it("throws for invalid multicodec prefix", () => {
      expect(() => extractPublicKeyFromDID("did:key:z111")).toThrow();
    });
  });
});
