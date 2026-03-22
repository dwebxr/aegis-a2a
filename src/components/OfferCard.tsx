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
    <div className="group bg-gray-900/60 border border-gray-800/50 rounded-2xl overflow-hidden hover:bg-gray-900/80 hover:border-gray-700/60 transition-all duration-300 flex flex-col">
      {/* Image */}
      {offer.imageUrl && (
        <div className="relative w-full h-44 bg-gray-800 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={offer.imageUrl}
            alt={offer.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent" />
          {/* Floating badges on image */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              {isBridged && (
                <span className="text-[10px] bg-indigo-900/70 backdrop-blur-sm text-indigo-300 px-2 py-0.5 rounded-md">
                  Bridge
                </span>
              )}
              {vcl && (
                <span className="text-[10px] bg-purple-900/70 backdrop-blur-sm text-purple-300 px-2 py-0.5 rounded-md">
                  VCL {vcl.composite.toFixed(1)}
                </span>
              )}
            </div>
            {resonanceScore !== null && (
              <span
                className={`text-[10px] backdrop-blur-sm px-2 py-0.5 rounded-md ${
                  resonanceScore >= 70
                    ? "bg-green-900/70 text-green-400"
                    : resonanceScore >= 40
                    ? "bg-yellow-900/70 text-yellow-400"
                    : "bg-gray-800/70 text-gray-500"
                }`}
              >
                {resonanceScore}%
              </span>
            )}
          </div>
        </div>
      )}

      <div className="px-5 pt-4 pb-5 flex flex-col flex-1">
        {/* Badges when no image */}
        {!offer.imageUrl && (
          <div className="flex items-center gap-1.5 mb-2">
            {isBridged && (
              <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded-md">Bridge</span>
            )}
            {vcl && (
              <span className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-md">VCL {vcl.composite.toFixed(1)}</span>
            )}
            {resonanceScore !== null && (
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${
                resonanceScore >= 70 ? "bg-green-900/50 text-green-400" : resonanceScore >= 40 ? "bg-yellow-900/50 text-yellow-400" : "bg-gray-800 text-gray-500"
              }`}>{resonanceScore}%</span>
            )}
          </div>
        )}

        {/* Title */}
        <h3 className="text-[15px] font-medium text-white mb-1.5 line-clamp-2 leading-snug tracking-tight">
          {offer.title}
        </h3>

        {/* Description */}
        <p className="text-gray-500 text-sm mb-3 line-clamp-2 leading-relaxed">
          {offer.description}
        </p>

        {/* Topics */}
        {offer.topics && offer.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {offer.topics.slice(0, 4).map((topic) => (
              <span key={topic} className="text-[10px] bg-gray-800/40 text-gray-500 px-2 py-0.5 rounded">
                {topic}
              </span>
            ))}
            {offer.topics.length > 4 && (
              <span className="text-[10px] text-gray-600">+{offer.topics.length - 4}</span>
            )}
          </div>
        )}

        {/* VCL Score Bars */}
        {vcl && (
          <div className="flex flex-col gap-1.5 mb-3">
            {([
              ["ORI", vcl.originality],
              ["INS", vcl.insight],
              ["CRD", vcl.credibility],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-6">{label}</span>
                <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500/60 to-blue-400/80 rounded-full"
                    style={{ width: `${(value / 10) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500 font-mono">{value.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Price + Action */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-800/50">
          <div className="flex items-center gap-2">
            <span className={isFree ? "text-green-400/80 font-semibold text-sm" : "text-blue-400 font-semibold text-sm"}>
              {isFree ? "Free" : formatUsdc(offer.priceUsdc)}
            </span>
            {offer.sourceUrl && (
              <a
                href={offer.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors truncate max-w-[120px]"
              >
                {offer.sourceName || (() => { try { return new URL(offer.sourceUrl!).hostname; } catch { return "source"; } })()}
              </a>
            )}
          </div>
          {isFree ? (
            offer.sourceUrl ? (
              <a
                href={offer.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 px-3.5 py-1.5 rounded-lg text-sm transition-colors inline-flex items-center gap-1"
              >
                Read <span className="text-gray-500">&rarr;</span>
              </a>
            ) : (
              <button
                onClick={() => onView?.(offer)}
                className="bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 px-3.5 py-1.5 rounded-lg text-sm transition-colors"
              >
                View
              </button>
            )
          ) : (
            <button
              onClick={() => onBuy(offer)}
              className="bg-blue-600/90 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-500/20 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
            >
              Buy
            </button>
          )}
        </div>

        {/* Meta footer */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-700">
          {isBridged ? (
            <a
              href={`https://aegis.dwebxr.xyz?utm_source=a2a&utm_medium=bridge&utm_content=${offer.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400/60 hover:text-indigo-300 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
              Curated by Aegis
            </a>
          ) : (
            <span className="font-mono">{offer.agentId}</span>
          )}
          <span>{offer.supportedChains.map((c) => CHAIN_NAMES[c]).join(" / ")}</span>
        </div>
      </div>
    </div>
  );
}
