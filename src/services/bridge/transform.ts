import type { D2ABriefingItem, SourceRef, BridgeConfig } from "@/types/bridge";
import type { Offer } from "@/types/offer";
import { createHash } from "crypto";

/** Matches Aegis本体's itemHash() — null byte separator between title and sourceUrl */
function deriveExternalId(item: D2ABriefingItem): string {
  return createHash("sha256").update(`${item.title}\0${item.sourceUrl}`).digest("hex");
}

/** Aegis composite is nominally 0-10 but can exceed 10 in some scoring engines. Clamp first. */
function scoreToPriceTier(composite: number): string {
  const clamped = Math.min(composite, 10);
  if (clamped >= 9.0) return "premium";
  if (clamped >= 7.0) return "basic";
  return "free";
}

function buildDescription(item: D2ABriefingItem): string {
  const { scores } = item;
  const parts: string[] = [item.reason];

  if (item.topics.length > 0) {
    parts.push(`Topics: ${item.topics.join(", ")}`);
  }

  const details = [
    `Composite: ${scores.composite.toFixed(1)}`,
    `Originality: ${scores.originality.toFixed(1)}`,
    `Insight: ${scores.insight.toFixed(1)}`,
    `Credibility: ${scores.credibility.toFixed(1)}`,
  ];
  if (scores.vSignal !== undefined) details.push(`V-Signal: ${scores.vSignal.toFixed(1)}`);
  if (scores.cContext !== undefined) details.push(`C-Context: ${scores.cContext.toFixed(1)}`);
  if (scores.lSlop !== undefined) details.push(`L-Slop: ${scores.lSlop.toFixed(1)}`);
  parts.push(`[${details.join(" | ")}]`);

  parts.push(`Source: ${item.source} (${item.sourceUrl})`);
  return parts.join(" | ");
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

  return {
    agentId: config.agentId,
    title: item.title,
    description: buildDescription(item),
    priceUsdc: config.priceTierMap[scoreToPriceTier(item.scores.composite)] ?? 0,
    contentHash: createHash("sha256").update(item.content).digest("hex"),
    supportedChains: [...config.defaultChains],
    encryptedContent: item.content,
    sourceRef,
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
