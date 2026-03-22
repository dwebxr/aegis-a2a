"use client";

import { useState, useEffect, useMemo } from "react";
import type { Offer, ChainType, ScoredOffer } from "@/types/offer";
import { useOffers } from "@/hooks/useOffers";
import { OfferCard } from "./OfferCard";
import { MultiChainPayButton } from "./MultiChainPayButton";
import { UnlockViewer } from "./UnlockViewer";
import { CHAIN_NAMES, CHAIN_ICONS } from "@/lib/constants";

type FeedTab = "free" | "premium";

export function A2AFeed() {
  const [tab, setTab] = useState<FeedTab>("free");
  const [chainFilter, setChainFilter] = useState<ChainType | undefined>();
  const { offers, isLoading, error, refetch } = useOffers(chainFilter);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [unlockedContent, setUnlockedContent] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [rankedOffers, setRankedOffers] = useState<ScoredOffer[]>([]);
  const [, setViewLoading] = useState(false);

  useEffect(() => {
    if (offers.length === 0) {
      setRankedOffers([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { rankOffers } = await import("@/services/preference/ranker");
        const scored = await rankOffers(offers);
        if (!cancelled) setRankedOffers(scored);
      } catch (err) {
        console.warn("[A2AFeed] Ranking failed, using defaults:", err);
        if (!cancelled) {
          setRankedOffers(offers.map((o) => ({ ...o, resonanceScore: 50 })));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [offers]);

  const trackInteraction = async (offerId: string, action: "view" | "purchase" | "dismiss", tags: string[]) => {
    const { recordInteraction } = await import("@/services/preference/db");
    recordInteraction(offerId, action, tags);
  };

  const handleViewFree = async (offer: Offer) => {
    setViewLoading(true);
    trackInteraction(offer.id, "view", offer.topics || []);
    try {
      const res = await fetch(`/api/agent/free?offerId=${offer.id}`);
      if (!res.ok) throw new Error("Failed to load content");
      const data = await res.json();
      setUnlockedContent({ title: offer.title, content: data.content });
    } catch {
      setUnlockedContent({ title: offer.title, content: "Failed to load content." });
    } finally {
      setViewLoading(false);
    }
  };

  const filteredOffers = useMemo(
    () => rankedOffers.filter((o) => tab === "free" ? o.priceUsdc === 0 : o.priceUsdc > 0),
    [rankedOffers, tab]
  );

  return (
    <div>
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-6">
        {(["free", "premium"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? t === "premium" ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t === "free" ? "Free" : "Premium (USDC)"}
          </button>
        ))}
      </div>

      {/* Chain Filter */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setChainFilter(undefined)}
          className={`text-xs px-3 py-1.5 rounded-full ${
            !chainFilter ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          All Chains
        </button>
        {(["base", "solana", "icp"] as const).map((chain) => (
          <button
            key={chain}
            onClick={() => setChainFilter(chain)}
            className={`text-xs px-3 py-1.5 rounded-full ${
              chainFilter === chain ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {CHAIN_ICONS[chain]} {CHAIN_NAMES[chain]}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center text-gray-500 py-12">Loading offers...</div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">
          {error}{" "}
          <button onClick={refetch} className="underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOffers.length === 0 ? (
            <div className="col-span-full text-center text-gray-500 py-12">
              No {tab} offers available
            </div>
          ) : (
            filteredOffers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} onBuy={setSelectedOffer} onView={handleViewFree} />
            ))
          )}
        </div>
      )}

      {selectedOffer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <MultiChainPayButton
            offer={selectedOffer}
            onUnlocked={(content) => {
              trackInteraction(selectedOffer.id, "purchase", selectedOffer.topics || []);
              setUnlockedContent({ title: selectedOffer.title, content });
              setSelectedOffer(null);
            }}
            onCancel={() => setSelectedOffer(null)}
          />
        </div>
      )}

      {unlockedContent && (
        <UnlockViewer
          title={unlockedContent.title}
          content={unlockedContent.content}
          onClose={() => setUnlockedContent(null)}
        />
      )}
    </div>
  );
}
