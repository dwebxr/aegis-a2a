import type { SourceRef } from "./bridge";

export type ChainType = "base" | "solana" | "icp";

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
