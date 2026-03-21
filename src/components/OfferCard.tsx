"use client";

import type { Offer, ScoredOffer } from "@/types/offer";
import { formatUsdc } from "@/lib/utils";
import { CHAIN_NAMES } from "@/lib/constants";

interface OfferCardProps {
  offer: Offer | ScoredOffer;
  onBuy: (offer: Offer) => void;
}

export function OfferCard({ offer, onBuy }: OfferCardProps) {
  const resonanceScore =
    "resonanceScore" in offer ? offer.resonanceScore : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-white">{offer.title}</h3>
        {resonanceScore !== null && (
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              resonanceScore >= 70
                ? "bg-green-900/50 text-green-400"
                : resonanceScore >= 40
                ? "bg-yellow-900/50 text-yellow-400"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {resonanceScore}% match
          </span>
        )}
      </div>

      <p className="text-gray-400 text-sm mb-4 line-clamp-3">
        {offer.description}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {offer.supportedChains.map((chain) => (
          <span
            key={chain}
            className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded"
          >
            {CHAIN_NAMES[chain]}
          </span>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-blue-400 font-bold">
          {formatUsdc(offer.priceUsdc)}
        </span>
        <button
          onClick={() => onBuy(offer)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Buy
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-600">
        Agent: {offer.agentId} &middot;{" "}
        {new Date(offer.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
