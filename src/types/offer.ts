import type { SourceRef } from "./bridge";

export type ChainType = "base" | "solana" | "icp";

export type VCLVerdict = "quality" | "slop";

export interface VCLScores {
  originality: number;
  insight: number;
  credibility: number;
  composite: number;
  vSignal?: number;
  cContext?: number;
  lSlop?: number;
  verdict: VCLVerdict;
}

export interface Offer {
  id: string;
  agentId: string;
  title: string;
  description: string;
  priceUsdc: number;
  contentHash: string;
  supportedChains: ChainType[];
  createdAt: number;
  encryptedContent?: string;
  sourceRef?: SourceRef;
  vclScores?: VCLScores;
  topics?: string[];
  sourceUrl?: string;
  sourceName?: string;
  imageUrl?: string;
  publisherDid?: string;
}

export interface ScoredOffer extends Offer {
  resonanceScore: number;
}

export interface OfferFilter {
  chain?: ChainType;
  minPrice?: number;
  maxPrice?: number;
  agentId?: string;
  sourceSystem?: string;
}
