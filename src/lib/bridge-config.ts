import type { BridgeConfig } from "@/types/bridge";
import type { ChainType } from "@/types/offer";
import { VALID_CHAINS, isValidChain } from "./constants";

const DEFAULT_PRICE_TIER_MAP: Record<string, number> = { free: 0, basic: 2, premium: 10 };

function parseChains(raw: string): ChainType[] {
  const parsed = raw.split(",").map((s) => s.trim()).filter(isValidChain);
  return parsed.length > 0 ? parsed : [...VALID_CHAINS];
}

function parsePriceTierMap(raw: string): Record<string, number> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "number" && value >= 0) {
      result[key] = value;
    }
  }
  return Object.keys(result).length === 0 ? DEFAULT_PRICE_TIER_MAP : result;
}

export function loadBridgeConfig(): BridgeConfig {
  const enabled = process.env.AEGIS_BRIDGE_ENABLED === "true";
  const aegisUrl = (process.env.AEGIS_HONTAL_URL || "").replace(/\/+$/, "");

  const syncIntervalRaw = process.env.AEGIS_SYNC_INTERVAL_MS;
  const syncIntervalMs =
    syncIntervalRaw && Number.isFinite(Number(syncIntervalRaw))
      ? Math.max(30_000, Number(syncIntervalRaw))
      : 300_000;

  const chainsRaw = process.env.AEGIS_DEFAULT_CHAINS;

  let priceTierMap = DEFAULT_PRICE_TIER_MAP;
  const tierRaw = process.env.AEGIS_PRICE_TIER_MAP;
  if (tierRaw) {
    try { priceTierMap = parsePriceTierMap(tierRaw); } catch { /* keep default */ }
  }

  const minScoreRaw = process.env.AEGIS_MIN_COMPOSITE_SCORE;

  return {
    enabled,
    aegisUrl,
    syncIntervalMs,
    agentId: process.env.AEGIS_AGENT_ID || "aegis-hontal",
    defaultChains: chainsRaw ? parseChains(chainsRaw) : [...VALID_CHAINS],
    priceTierMap,
    qualityOnly: process.env.AEGIS_BRIDGE_QUALITY_ONLY !== "false",
    minCompositeScore: minScoreRaw && Number.isFinite(Number(minScoreRaw))
      ? Number(minScoreRaw) : 7.0,
    principal: process.env.AEGIS_BRIDGE_PRINCIPAL || "",
  };
}
