"use client";

import { useState, useCallback } from "react";
import type { ChainType } from "@/types/offer";

export function useUnlock() {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(
    async (offerId: string, txHash: string, chain: ChainType, payer?: string) => {
      setIsUnlocking(true);
      setError(null);
      setContent(null);

      try {
        const res = await fetch("/api/agent/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId, txHash, chain, payer }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Unlock failed");
          return null;
        }

        setContent(data.content);
        return data.content;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unlock failed";
        setError(msg);
        return null;
      } finally {
        setIsUnlocking(false);
      }
    },
    []
  );

  return { unlock, isUnlocking, content, error };
}
