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

    // Same content should produce same external ID
    expect(r1!.sourceRef!.externalId).toBe(r2!.sourceRef!.externalId);
  });

  it("produces different external IDs for different items", () => {
    const config = makeConfig();
    const r1 = transformBriefingItem(makeItem({ title: "A" }), config, 1);
    const r2 = transformBriefingItem(makeItem({ title: "B" }), config, 1);
    expect(r1!.sourceRef!.externalId).not.toBe(r2!.sourceRef!.externalId);
  });

  it("maps composite >= 9.0 to premium price", () => {
    const config = makeConfig();
    const item = makeItem({
      scores: { originality: 9, insight: 9, credibility: 9, composite: 9.5 },
    });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.priceUsdc).toBe(10); // premium
  });

  it("maps composite >= 7.0 to basic price", () => {
    const config = makeConfig();
    const item = makeItem({
      scores: { originality: 7, insight: 7, credibility: 8, composite: 7.5 },
    });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.priceUsdc).toBe(2); // basic
  });

  it("maps composite < 7.0 to free price", () => {
    const config = makeConfig({ minCompositeScore: 0 });
    const item = makeItem({
      scores: { originality: 5, insight: 5, credibility: 5, composite: 5.0 },
    });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.priceUsdc).toBe(0); // free
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

  it("includes V/C/L scores in description when present", () => {
    const config = makeConfig();
    const item = makeItem();
    const result = transformBriefingItem(item, config, 1);
    expect(result!.description).toContain("V-Signal: 7.5");
    expect(result!.description).toContain("C-Context: 6.0");
    expect(result!.description).toContain("L-Slop: 2.0");
  });

  it("includes topics in description", () => {
    const config = makeConfig();
    const item = makeItem({ topics: ["DeFi", "MEV"] });
    const result = transformBriefingItem(item, config, 1);
    expect(result!.description).toContain("DeFi");
    expect(result!.description).toContain("MEV");
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
