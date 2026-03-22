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
      {/* Toolbar: tabs + chain filter in one row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex gap-1 bg-gray-900/80 border border-gray-800/50 rounded-xl p-1">
          {(["free", "premium"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === t
                  ? t === "premium"
                    ? "bg-blue-600/90 text-white shadow-md shadow-blue-500/20"
                    : "bg-gray-700/80 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "free" ? "Free" : "Premium"}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setChainFilter(undefined)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              !chainFilter ? "bg-gray-700/80 text-white" : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
            }`}
          >
            All
          </button>
          {(["base", "solana", "icp"] as const).map((chain) => (
            <button
              key={chain}
              onClick={() => setChainFilter(chain)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                chainFilter === chain ? "bg-gray-700/80 text-white" : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
              }`}
            >
              {CHAIN_ICONS[chain]} {CHAIN_NAMES[chain]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="text-center text-red-400 py-12">
          {error}{" "}
          <button onClick={refetch} className="underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredOffers.length === 0 ? (
            <div className="col-span-full text-center text-gray-600 py-16">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
