import type { D2ABriefingItem, SourceRef, BridgeConfig } from "@/types/bridge";
import type { Offer, VCLScores } from "@/types/offer";
import { createHash } from "crypto";

/** Matches Aegis本体's itemHash() — null byte separator between title and sourceUrl */
function deriveExternalId(item: D2ABriefingItem): string {
  return createHash("sha256").update(`${item.title}\0${item.sourceUrl}`).digest("hex");
}

function extractImageUrl(content: string): string | undefined {
  const imgMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (imgMatch) return imgMatch[1];

  const htmlMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
  if (htmlMatch) return htmlMatch[1];

  const ogMatch = content.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?/i);
  if (ogMatch) return ogMatch[0];

  return undefined;
}

export function transformBriefingItem(
  item: D2ABriefingItem,
  config: BridgeConfig,
  version: number,
): Omit<Offer, "id" | "createdAt"> | null {
  if (config.qualityOnly && item.verdict !== "quality") return null;
  if (item.scores.composite < config.minCompositeScore) return null;

  const externalId = deriveExternalId(item);
  const sourceRef: SourceRef = { system: "aegis-hontal", externalId, version, syncedAt: Date.now() };

  const vclScores: VCLScores = {
    originality: item.scores.originality,
    insight: item.scores.insight,
    credibility: item.scores.credibility,
    composite: item.scores.composite,
    verdict: item.verdict,
    ...(item.scores.vSignal !== undefined && { vSignal: item.scores.vSignal }),
    ...(item.scores.cContext !== undefined && { cContext: item.scores.cContext }),
    ...(item.scores.lSlop !== undefined && { lSlop: item.scores.lSlop }),
  };

  return {
    agentId: config.agentId,
    title: item.title,
    description: item.reason,
    priceUsdc: 0,
    contentHash: createHash("sha256").update(item.content).digest("hex"),
    supportedChains: [...config.defaultChains],
    encryptedContent: item.content,
    sourceRef,
    vclScores,
    topics: item.topics,
    sourceUrl: item.sourceUrl,
    sourceName: item.source,
    imageUrl: extractImageUrl(item.content),
  };
}

export function transformBriefingItems(
  items: D2ABriefingItem[],
  config: BridgeConfig,
  version: number,
): Map<string, Omit<Offer, "id" | "createdAt">> {
  const result = new Map<string, Omit<Offer, "id" | "createdAt">>();

  for (const item of items) {
    const offer = transformBriefingItem(item, config, version);
    if (offer?.sourceRef) {
      result.set(offer.sourceRef.externalId, offer);
    }
  }

  return result;
}
