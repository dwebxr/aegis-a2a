"use client";

import { useState, useEffect, useCallback } from "react";
import type { Offer, ChainType } from "@/types/offer";

export function useOffers(chain?: ChainType) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function doFetch() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (chain) params.set("chain", chain);

      const res = await fetch(`/api/agent/offers?${params.toString()}`);
      if (cancelled) return;

      if (!res.ok) {
        setError(`Failed to fetch offers: ${res.status}`);
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      if (cancelled) return;

      setOffers(data.offers || []);
      setIsLoading(false);
    }

    doFetch();

    return () => {
      cancelled = true;
    };
  }, [chain, refreshKey]);

  return { offers, isLoading, error, refetch };
}
