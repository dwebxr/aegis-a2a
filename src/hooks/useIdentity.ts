"use client";

import { useState, useEffect, useCallback } from "react";
import type { KeyPair, AgentProfile, IdentityPackage } from "@/types/identity";

const STORAGE_KEY = "aegis-identity";

function loadKeyPair(): { keyPair: KeyPair | null; wasCorrupted: boolean } {
  if (typeof window === "undefined") return { keyPair: null, wasCorrupted: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { keyPair: null, wasCorrupted: false };
    const data = JSON.parse(raw);
    if (!data.did || !data.publicKey || !data.privateKey) {
      throw new Error("Missing required fields");
    }
    return {
      keyPair: {
        publicKey: new Uint8Array(data.publicKey),
        privateKey: new Uint8Array(data.privateKey),
        did: data.did,
        created: data.created,
      },
      wasCorrupted: false,
    };
  } catch {
    // Clear corrupted data so it doesn't persist
    localStorage.removeItem(STORAGE_KEY);
    return { keyPair: null, wasCorrupted: true };
  }
}

function saveKeyPair(kp: KeyPair): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      publicKey: Array.from(kp.publicKey),
      privateKey: Array.from(kp.privateKey),
      did: kp.did,
      created: kp.created,
    }),
  );
}

export function useIdentity() {
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [wasCorrupted, setWasCorrupted] = useState(false);

  useEffect(() => {
    const { keyPair: loaded, wasCorrupted: corrupted } = loadKeyPair();
    setKeyPair(loaded);
    setWasCorrupted(corrupted);
  }, []);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const { generateKeyPair } = await import("@/services/identity/did");
      const kp = await generateKeyPair();
      const keyPairData: KeyPair = {
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        did: kp.did,
        created: Date.now(),
      };
      saveKeyPair(keyPairData);
      setKeyPair(keyPairData);
      return keyPairData;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const exportIdentity = useCallback(
    async (
      profile: AgentProfile,
      topics: string[],
      capabilities: string[],
    ): Promise<IdentityPackage | null> => {
      if (!keyPair) return null;
      const { exportIdentity: doExport } = await import(
        "@/services/identity/export"
      );
      const multibase = keyPair.did.slice("did:key:".length);
      return doExport(
        keyPair.did,
        multibase,
        keyPair.privateKey,
        profile,
        [],
        topics,
        capabilities,
      );
    },
    [keyPair],
  );

  const verifyImport = useCallback(
    async (
      pkg: IdentityPackage,
    ): Promise<{ valid: boolean; error?: string }> => {
      // Call the real server-side verification endpoint
      try {
        const res = await fetch("/api/agent/identity/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pkg),
        });
        const data = await res.json();
        if (!res.ok) {
          return { valid: false, error: data.error || `Server error: ${res.status}` };
        }
        return { valid: !!data.valid, error: data.error };
      } catch {
        // Network failure — fall back to client-side verification
        const { verifyIdentityPackage } = await import(
          "@/services/identity/export"
        );
        return verifyIdentityPackage(pkg);
      }
    },
    [],
  );

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setKeyPair(null);
  }, []);

  return {
    keyPair,
    did: keyPair?.did ?? null,
    isGenerating,
    wasCorrupted,
    generate,
    exportIdentity,
    verifyImport,
    clearIdentity,
  };
}
