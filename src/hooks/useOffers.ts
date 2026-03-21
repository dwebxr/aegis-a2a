"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Offer, ChainType } from "@/types/offer";

export function useOffers(chain?: ChainType) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOffers = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (chain) params.set("chain", chain);

      const res = await fetch(`/api/agent/offers?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to fetch offers: ${res.status}`);

      const data = await res.json();
      if (!controller.signal.aborted) {
        setOffers(data.offers || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Failed to load offers");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [chain]);

  useEffect(() => {
    fetchOffers();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchOffers]);

  return { offers, isLoading, error, refetch: fetchOffers };
}
