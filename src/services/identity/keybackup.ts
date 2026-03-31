// Encrypts/decrypts DID key pairs using AES-256-GCM with a password-derived key (PBKDF2)

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000; // OWASP recommended minimum for SHA-256

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey("raw", encoded.buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedKeyBackup {
  version: 1;
  salt: string;   // hex
  iv: string;      // hex
  ciphertext: string; // hex
  did: string;     // plaintext for identification
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function encryptKeyBackup(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  did: string,
  password: string,
): Promise<EncryptedKeyBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  // Pack private + public keys into a single payload
  const payload = new Uint8Array(privateKey.length + publicKey.length);
  payload.set(privateKey, 0);
  payload.set(publicKey, privateKey.length);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, payload.buffer as ArrayBuffer),
  );

  return {
    version: 1,
    salt: toHex(salt),
    iv: toHex(iv),
    ciphertext: toHex(ciphertext),
    did,
  };
}

export async function decryptKeyBackup(
  backup: EncryptedKeyBackup,
  password: string,
): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array; did: string }> {
  const salt = fromHex(backup.salt);
  const iv = fromHex(backup.iv);
  const ciphertext = fromHex(backup.ciphertext);
  const key = await deriveKey(password, salt);

  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, ciphertext.buffer as ArrayBuffer),
  );

  // Ed25519: 32 bytes private + 32 bytes public
  const privateKey = decrypted.slice(0, 32);
  const publicKey = decrypted.slice(32, 64);

  return { privateKey, publicKey, did: backup.did };
}
