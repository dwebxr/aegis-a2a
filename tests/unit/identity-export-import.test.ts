import { describe, it, expect } from "vitest";
import { generateKeyPair } from "@/services/identity/did";
import { issueCredential, verifyCredential } from "@/services/identity/credentials";
import { exportIdentity, verifyIdentityPackage } from "@/services/identity/export";
import { resolveDID, isValidDID } from "@/services/identity/resolver";

describe("Identity Export/Import", () => {
  describe("Credential Issuance and Verification", () => {
    it("issues and verifies a credential", async () => {
      const kp = await generateKeyPair();

      const credential = await issueCredential(
        kp.did,
        kp.did,
        "AgentQualityCredential",
        { averageVCL: 8.5, totalPublished: 42 },
        kp.privateKey,
        kp.publicKeyMultibase,
      );

      expect(credential.issuer).toBe(kp.did);
      expect(credential.credentialSubject.id).toBe(kp.did);
      expect(credential.credentialSubject.averageVCL).toBe(8.5);
      expect(credential.proof).toBeDefined();

      const result = await verifyCredential(credential);
      expect(result.valid).toBe(true);
    });

    it("rejects tampered credential", async () => {
      const kp = await generateKeyPair();

      const credential = await issueCredential(
        kp.did,
        kp.did,
        "AgentQualityCredential",
        { averageVCL: 8.5 },
        kp.privateKey,
        kp.publicKeyMultibase,
      );

      // Tamper with the credential
      credential.credentialSubject.averageVCL = 10;

      const result = await verifyCredential(credential);
      expect(result.valid).toBe(false);
    });

    it("rejects credential without proof", async () => {
      const result = await verifyCredential({
        "@context": [],
        type: ["VerifiableCredential"],
        issuer: "did:key:z6MkTest",
        issuanceDate: new Date().toISOString(),
        credentialSubject: { id: "did:key:z6MkTest" },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("No proof");
    });
  });

  describe("Identity Package Export/Import", () => {
    it("exports and verifies an identity package", async () => {
      const kp = await generateKeyPair();

      const pkg = await exportIdentity(
        kp.did,
        kp.publicKeyMultibase,
        kp.privateKey,
        {
          displayName: "Test Agent",
          agentId: "test-agent",
          platforms: ["aegis-a2a"],
        },
        [],
        ["crypto", "defi"],
        ["publish", "purchase"],
      );

      expect(pkg.did).toBe(kp.did);
      expect(pkg.profile.displayName).toBe("Test Agent");
      expect(pkg.preferences.topics).toEqual(["crypto", "defi"]);
      expect(pkg.capabilities).toEqual(["publish", "purchase"]);
      expect(pkg.proof).toBeDefined();

      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(true);
    });

    it("rejects tampered package", async () => {
      const kp = await generateKeyPair();

      const pkg = await exportIdentity(
        kp.did,
        kp.publicKeyMultibase,
        kp.privateKey,
        {
          displayName: "Agent",
          agentId: "test",
          platforms: [],
        },
        [],
        [],
        [],
      );

      // Tamper
      pkg.profile.displayName = "Evil Agent";

      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(false);
    });

    it("rejects package with invalid DID", async () => {
      const kp = await generateKeyPair();

      const pkg = await exportIdentity(
        kp.did,
        kp.publicKeyMultibase,
        kp.privateKey,
        { displayName: "Agent", agentId: "test", platforms: [] },
        [],
        [],
        [],
      );

      // Replace DID with invalid one
      pkg.did = "did:web:example.com";

      const result = await verifyIdentityPackage(pkg);
      expect(result.valid).toBe(false);
    });
  });

  describe("DID Resolver", () => {
    it("resolves a generated did:key to a DID Document", async () => {
      const kp = await generateKeyPair();
      const doc = resolveDID(kp.did);

      expect(doc.id).toBe(kp.did);
      expect(doc.verificationMethod).toHaveLength(1);
      expect(doc.verificationMethod[0]!.publicKeyMultibase).toBe(
        kp.publicKeyMultibase,
      );
    });

    it("throws for non did:key", () => {
      expect(() => resolveDID("did:web:example.com")).toThrow();
    });
  });

  describe("isValidDID", () => {
    it("returns true for valid did:key", async () => {
      const kp = await generateKeyPair();
      expect(isValidDID(kp.did)).toBe(true);
    });

    it("returns false for invalid DID", () => {
      expect(isValidDID("not-a-did")).toBe(false);
      expect(isValidDID("did:web:example.com")).toBe(false);
    });
  });
});
