import type { ChainType } from "./offer";

export interface D2ABriefingScores {
  originality: number;
  insight: number;
  credibility: number;
  composite: number;
  vSignal?: number;
  cContext?: number;
  lSlop?: number;
}

export interface D2ABriefingItem {
  title: string;
  content: string;
  source: string;
  sourceUrl: string;
  scores: D2ABriefingScores;
  verdict: "quality" | "slop";
  reason: string;
  topics: string[];
  briefingScore: number;
}

export interface D2ABriefingResponse {
  version: "1.0";
  generatedAt: string;
  source: "aegis";
  sourceUrl: string;
  summary: {
    totalEvaluated: number;
    totalBurned: number;
    qualityRate: number;
  };
  items: D2ABriefingItem[];
  serendipityPick: D2ABriefingItem | null;
  meta: {
    scoringModel: string;
    nostrPubkey: string | null;
    topics: string[];
  };
}

export interface AegisD2AHealth {
  status: "ok" | "degraded";
  timestamp: string;
  version: string;
  region: string;
  checks: Record<string, string>;
}

export interface ChangesResponse {
  since: string;
  checkedAt: string;
  changes: Array<{
    action: "added" | "updated" | "removed";
    itemHash: string;
    title: string;
    sourceUrl: string;
    composite: number;
    generatedAt: string;
  }>;
}

export interface SourceRef {
  system: "aegis-hontal";
  externalId: string;
  version: number;
  syncedAt: number;
}

export interface SyncState {
  lastSyncAt: number;
  lastBriefingGeneratedAt: string | null;
  totalSynced: number;
  totalRemoved: number;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface BridgeConfig {
  enabled: boolean;
  aegisUrl: string;
  syncIntervalMs: number;
  agentId: string;
  defaultChains: ChainType[];
  priceTierMap: Record<string, number>;
  qualityOnly: boolean;
  minCompositeScore: number;
  /** IC principal for fetching individual briefings. Without this, falls back to global. */
  principal: string;
}
