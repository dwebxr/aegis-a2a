import { describe, it, expect } from "vitest";
import { encryptKeyBackup, decryptKeyBackup } from "@/services/identity/keybackup";
import { generateKeyPair } from "@/services/identity/did";

describe("Key Backup — AES-256-GCM Encryption", () => {
  it("round-trips encrypt → decrypt with correct password", async () => {
    const kp = await generateKeyPair();
    const backup = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "strongpass123");

    expect(backup.version).toBe(1);
    expect(backup.did).toBe(kp.did);
    expect(backup.salt).toHaveLength(32); // 16 bytes hex
    expect(backup.iv).toHaveLength(24);   // 12 bytes hex
    expect(backup.ciphertext.length).toBeGreaterThan(0);

    const restored = await decryptKeyBackup(backup, "strongpass123");
    expect(restored.did).toBe(kp.did);
    expect(restored.privateKey).toEqual(kp.privateKey);
    expect(restored.publicKey).toEqual(kp.publicKey);
  });

  it("fails with wrong password", async () => {
    const kp = await generateKeyPair();
    const backup = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "correct");

    await expect(decryptKeyBackup(backup, "wrong")).rejects.toThrow();
  });

  it("produces different ciphertext for same key with different passwords", async () => {
    const kp = await generateKeyPair();
    const b1 = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "pass1");
    const b2 = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "pass2");
    expect(b1.ciphertext).not.toBe(b2.ciphertext);
  });

  it("produces different ciphertext on each call (random salt/iv)", async () => {
    const kp = await generateKeyPair();
    const b1 = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "same");
    const b2 = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "same");
    expect(b1.salt).not.toBe(b2.salt);
    expect(b1.iv).not.toBe(b2.iv);
  });

  it("restored keys can sign and verify", async () => {
    const kp = await generateKeyPair();
    const backup = await encryptKeyBackup(kp.privateKey, kp.publicKey, kp.did, "test");
    const restored = await decryptKeyBackup(backup, "test");

    const { sign, verify } = await import("@/services/identity/did");
    const payload = new TextEncoder().encode("important data");
    const sig = await sign(payload, restored.privateKey);
    const valid = await verify(sig, payload, restored.publicKey);
    expect(valid).toBe(true);
  });
});
