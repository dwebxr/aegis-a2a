import { describe, it, expect } from "vitest";
import { transformBriefingItem, transformBriefingItems } from "@/services/bridge/transform";
import type { D2ABriefingItem, BridgeConfig } from "@/types/bridge";

function makeConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    aegisUrl: "https://aegis.dwebxr.xyz",
    syncIntervalMs: 300_000,
    agentId: "aegis-hontal",
    defaultChains: ["base", "solana", "icp"],
    priceTierMap: { free: 0, basic: 2, premium: 10 },
    qualityOnly: true,
    minCompositeScore: 7.0,
    principal: "",
    ...overrides,
  };
}

function makeItem(overrides: Partial<D2ABriefingItem> = {}): D2ABriefingItem {
  return {
    title: "AI Governance Report Q1",
    content: "Detailed analysis of AI governance trends...",
    source: "nostr",
    sourceUrl: "https://example.com/report",
    scores: {
      originality: 8.5,
      insight: 9.0,
      credibility: 8.0,
      composite: 8.5,
      vSignal: 7.5,
      cContext: 6.0,
      lSlop: 2.0,
    },
    verdict: "quality",
    reason: "Strong original analysis with credible sources",
    topics: ["AI", "governance"],
    briefingScore: 85,
    ...overrides,
  };
}

describe("transformBriefingItem", () => {
  it("transforms a quality item into an offer", () => {
    const config = makeConfig();
    const item = makeItem();
    const result = transformBriefingItem(item, config, 1000);

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("aegis-hontal");
    expect(result!.title).toBe("AI Governance Report Q1");
    expect(result!.encryptedContent).toBe("Detailed analysis of AI governance trends...");
    expect(result!.supportedChains).toEqual(["base", "solana", "icp"]);
    expect(result!.sourceRef).toBeDefined();
    expect(result!.sourceRef!.system).toBe("aegis-hontal");
    expect(result!.sourceRef!.version).toBe(1000);
  });

  it("derives deterministic external IDs from title + sourceUrl", () => {
    const config = makeConfig();
    const item = makeItem();
    const r1 = transformBriefingItem(item, config, 1);
    const r2 = transformBriefingItem(item, config, 2);

    expect(r1!.sourceRef!.externalId).toBe(r2!.sourceRef!.externalId);
  });

  it("produces different external IDs for different items", () => {
    const config = makeConfig();
    const r1 = transformBriefingItem(makeItem({ title: "A" }), config, 1);
    const r2 = transformBriefingItem(makeItem({ title: "B" }), config, 1);
    expect(r1!.sourceRef!.externalId).not.toBe(r2!.sourceRef!.externalId);
  });

  it("prices bridge offers based on briefingScore tiers", () => {
    const config = makeConfig();
    // briefingScore >= 80 → premium (10), >= 60 → basic (2), else → free (0)
    const premium = makeItem({ briefingScore: 85 });
    const basic = makeItem({ briefingScore: 65 });
    const free = makeItem({ briefingScore: 40 });
    expect(transformBriefingItem(premium, config, 1)!.priceUsdc).toBe(10);
    expect(transformBriefingItem(basic, config, 1)!.priceUsdc).toBe(2);
    expect(transformBriefingItem(free, config, 1)!.priceUsdc).toBe(0);
  });

  it("sets description to item.reason", () => {
    const config = makeConfig();
    const item = makeItem({ reason: "Unique cross-chain analysis" });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.description).toBe("Unique cross-chain analysis");
  });

  it("stores VCL scores as structured vclScores field", () => {
    const config = makeConfig();
    const item = makeItem();
    const result = transformBriefingItem(item, config, 1);

    expect(result!.vclScores).toBeDefined();
    expect(result!.vclScores!.originality).toBe(8.5);
    expect(result!.vclScores!.insight).toBe(9.0);
    expect(result!.vclScores!.credibility).toBe(8.0);
    expect(result!.vclScores!.composite).toBe(8.5);
    expect(result!.vclScores!.verdict).toBe("quality");
    expect(result!.vclScores!.vSignal).toBe(7.5);
    expect(result!.vclScores!.cContext).toBe(6.0);
    expect(result!.vclScores!.lSlop).toBe(2.0);
  });

  it("omits optional VCL fields when not present in source", () => {
    const config = makeConfig();
    const item = makeItem({
      scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 },
    });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.vclScores!.vSignal).toBeUndefined();
    expect(result!.vclScores!.cContext).toBeUndefined();
    expect(result!.vclScores!.lSlop).toBeUndefined();
  });

  it("stores topics as structured array", () => {
    const config = makeConfig();
    const item = makeItem({ topics: ["DeFi", "MEV"] });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.topics).toEqual(["DeFi", "MEV"]);
  });

  it("stores sourceUrl and sourceName", () => {
    const config = makeConfig();
    const item = makeItem({ sourceUrl: "https://example.com/article", source: "rss" });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.sourceUrl).toBe("https://example.com/article");
    expect(result!.sourceName).toBe("rss");
  });

  it("returns null for slop verdict when qualityOnly is true", () => {
    const config = makeConfig({ qualityOnly: true });
    const item = makeItem({ verdict: "slop" });
    expect(transformBriefingItem(item, config, 1)).toBeNull();
  });

  it("includes slop verdict when qualityOnly is false", () => {
    const config = makeConfig({ qualityOnly: false, minCompositeScore: 0 });
    const item = makeItem({ verdict: "slop", scores: { originality: 3, insight: 3, credibility: 3, composite: 3.0 } });
    expect(transformBriefingItem(item, config, 1)).not.toBeNull();
  });

  it("returns null when below minCompositeScore", () => {
    const config = makeConfig({ minCompositeScore: 9.0 });
    const item = makeItem({
      scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 },
    });
    expect(transformBriefingItem(item, config, 1)).toBeNull();
  });

  it("extracts imageUrl from content with markdown image", () => {
    const config = makeConfig();
    const item = makeItem({ content: "# Title\n\n![photo](https://img.example.com/pic.jpg)\n\nBody text" });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.imageUrl).toBe("https://img.example.com/pic.jpg");
  });

  it("sets imageUrl undefined when content has no images", () => {
    const config = makeConfig();
    const item = makeItem({ content: "Plain text with no images" });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.imageUrl).toBeUndefined();
  });

  it("generates a content hash", () => {
    const config = makeConfig();
    const item = makeItem();
    const result = transformBriefingItem(item, config, 1);
    expect(result!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("transformBriefingItems", () => {
  it("transforms multiple items into a Map keyed by externalId", () => {
    const config = makeConfig();
    const items = [
      makeItem({ title: "First" }),
      makeItem({ title: "Second" }),
    ];
    const result = transformBriefingItems(items, config, 1);
    expect(result.size).toBe(2);
  });

  it("filters out items below threshold", () => {
    const config = makeConfig({ minCompositeScore: 8.0 });
    const items = [
      makeItem({ title: "High", scores: { originality: 9, insight: 9, credibility: 9, composite: 9.0 } }),
      makeItem({ title: "Low", scores: { originality: 5, insight: 5, credibility: 5, composite: 5.0 } }),
    ];
    const result = transformBriefingItems(items, config, 1);
    expect(result.size).toBe(1);
  });

  it("deduplicates items with same title + sourceUrl", () => {
    const config = makeConfig();
    const items = [
      makeItem({ title: "Same", sourceUrl: "https://same.com" }),
      makeItem({ title: "Same", sourceUrl: "https://same.com" }),
    ];
    const result = transformBriefingItems(items, config, 1);
    expect(result.size).toBe(1);
  });
});
