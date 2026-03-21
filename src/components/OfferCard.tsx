"use client";

import type { Offer, ScoredOffer } from "@/types/offer";
import { formatUsdc } from "@/lib/utils";
import { CHAIN_NAMES } from "@/lib/constants";

interface OfferCardProps {
  offer: Offer | ScoredOffer;
  onBuy: (offer: Offer) => void;
  onView?: (offer: Offer) => void;
}

export function OfferCard({ offer, onBuy, onView }: OfferCardProps) {
  const isFree = offer.priceUsdc === 0;
  const resonanceScore =
    "resonanceScore" in offer ? offer.resonanceScore : null;
  const isBridged = !!offer.sourceRef;
  const vcl = offer.vclScores;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors flex flex-col">
      {/* Image */}
      {offer.imageUrl && (
        <div className="relative w-full h-40 bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={offer.imageUrl}
            alt={offer.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        {/* Header: badges row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {isBridged && (
            <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded">
              Aegis Bridge
            </span>
          )}
          {resonanceScore !== null && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
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
          {vcl && (
            <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded">
              VCL {vcl.composite.toFixed(1)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">
          {offer.title}
        </h3>

        {/* Description */}
        <p className="text-gray-400 text-sm mb-3 line-clamp-3 leading-relaxed">
          {offer.description}
        </p>

        {/* Topics */}
        {offer.topics && offer.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {offer.topics.slice(0, 5).map((topic) => (
              <span
                key={topic}
                className="text-xs bg-gray-800/80 text-gray-300 px-2 py-0.5 rounded-full"
              >
                {topic}
              </span>
            ))}
            {offer.topics.length > 5 && (
              <span className="text-xs text-gray-500">
                +{offer.topics.length - 5}
              </span>
            )}
          </div>
        )}

        {/* VCL Score Details */}
        {vcl && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-gray-800/50 rounded-lg px-2 py-1.5 text-center">
              <div className="text-gray-500 mb-0.5">Originality</div>
              <div className="text-gray-200 font-medium">{vcl.originality.toFixed(1)}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg px-2 py-1.5 text-center">
              <div className="text-gray-500 mb-0.5">Insight</div>
              <div className="text-gray-200 font-medium">{vcl.insight.toFixed(1)}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg px-2 py-1.5 text-center">
              <div className="text-gray-500 mb-0.5">Credibility</div>
              <div className="text-gray-200 font-medium">{vcl.credibility.toFixed(1)}</div>
            </div>
          </div>
        )}

        {/* Spacer to push footer down */}
        <div className="flex-1" />

        {/* Source link */}
        {offer.sourceUrl && (
          <div className="mb-3 text-xs">
            <a
              href={offer.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
            >
              <span className="truncate max-w-[200px]">
                {offer.sourceName || new URL(offer.sourceUrl).hostname}
              </span>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Chain tags */}
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

        {/* Price + Action */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-800">
          <span className={isFree ? "text-green-400 font-bold" : "text-blue-400 font-bold"}>
            {isFree ? "Free" : formatUsdc(offer.priceUsdc)}
          </span>
          {isFree ? (
            offer.sourceUrl ? (
              <a
                href={offer.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5"
              >
                Read
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              <button
                onClick={() => onView?.(offer)}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                View
              </button>
            )
          ) : (
            <button
              onClick={() => onBuy(offer)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Buy
            </button>
          )}
        </div>

        {/* Meta footer */}
        <div className="mt-3 text-xs text-gray-600">
          Agent: {offer.agentId} &middot;{" "}
          {new Date(offer.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
