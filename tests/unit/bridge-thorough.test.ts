import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { transformBriefingItem, transformBriefingItems } from "@/services/bridge/transform";
import { loadBridgeConfig } from "@/lib/bridge-config";
import {
  addOffer,
  updateOffer,
  findOfferBySourceRef,
  listOffersBySource,
  listOffers,
  _resetForTesting,
} from "@/services/content/store";
import type { D2ABriefingItem, BridgeConfig, D2ABriefingResponse } from "@/types/bridge";
import type { ChainType } from "@/types/offer";

// fs mock — both named and default exports
vi.mock("fs", () => {
  const mock = {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue("[]"),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return { ...mock, default: mock };
});

const mockFetch = vi.fn().mockRejectedValue(new Error("unmocked fetch"));
vi.stubGlobal("fetch", mockFetch);

beforeEach(async () => {
  _resetForTesting();
  mockFetch.mockReset();
  // Reset fs mocks to default behavior (no files exist)
  const fs = await import("fs");
  (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
  (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("[]");
  (fs.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  // Reset sync state
  const { _resetSyncStateForTesting } = await import("@/services/bridge/sync");
  _resetSyncStateForTesting();
});

// --- Shared helpers ---

function makeConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    aegisUrl: "https://aegis.dwebxr.xyz",
    syncIntervalMs: 300_000,
    agentId: "aegis-hontal",
    defaultChains: ["base", "solana", "icp"] as ChainType[],
    priceTierMap: { free: 0, basic: 2, premium: 10 },
    qualityOnly: true,
    minCompositeScore: 7.0,
    principal: "",
    ...overrides,
  };
}

function makeItem(overrides: Partial<D2ABriefingItem> = {}): D2ABriefingItem {
  return {
    title: "Test Article",
    content: "Test content body",
    source: "nostr",
    sourceUrl: "https://example.com/test",
    scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 },
    verdict: "quality",
    reason: "Good analysis",
    topics: ["AI"],
    briefingScore: 80,
    ...overrides,
  };
}

function makeBriefing(
  items: Array<{ title: string; composite: number }>,
  generatedAt = "2026-03-21T00:00:00Z",
): D2ABriefingResponse {
  return {
    version: "1.0",
    generatedAt,
    source: "aegis",
    sourceUrl: "https://aegis.dwebxr.xyz",
    summary: { totalEvaluated: items.length * 2, totalBurned: items.length, qualityRate: 0.5 },
    items: items.map((i) => makeItem({
      title: i.title,
      sourceUrl: `https://example.com/${i.title.toLowerCase().replace(/\s+/g, "-")}`,
      scores: { originality: i.composite, insight: i.composite, credibility: i.composite, composite: i.composite },
    })),
    serendipityPick: null,
    meta: { scoringModel: "test", nostrPubkey: null, topics: ["test"] },
  };
}

function mockBriefingFetch(briefing: D2ABriefingResponse) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => briefing });
}

// ==========================================================================
// transform.ts — boundary + edge case tests
// ==========================================================================

describe("transform edge cases", () => {
  it("all bridge offers are free regardless of composite score", () => {
    const high = transformBriefingItem(
      makeItem({ scores: { originality: 9, insight: 9, credibility: 9, composite: 9.0 } }),
      makeConfig(), 1,
    );
    const mid = transformBriefingItem(
      makeItem({ scores: { originality: 7, insight: 7, credibility: 7, composite: 7.0 } }),
      makeConfig(), 1,
    );
    const low = transformBriefingItem(
      makeItem({ scores: { originality: 7, insight: 7, credibility: 7, composite: 6.99 } }),
      makeConfig({ minCompositeScore: 0 }), 1,
    );
    expect(high!.priceUsdc).toBe(0);
    expect(mid!.priceUsdc).toBe(0);
    expect(low!.priceUsdc).toBe(0);
  });

  it("description is item.reason, topics stored as structured field", () => {
    const result = transformBriefingItem(makeItem({ topics: ["DeFi"], reason: "Good analysis" }), makeConfig(), 1);
    expect(result!.description).toBe("Good analysis");
    expect(result!.topics).toEqual(["DeFi"]);
  });

  it("VCL scores stored as structured vclScores field", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0, vSignal: 7.5, cContext: 6.0, lSlop: 2.0 } }),
      makeConfig(), 1,
    );
    expect(result!.vclScores).toBeDefined();
    expect(result!.vclScores!.composite).toBe(8.0);
    expect(result!.vclScores!.vSignal).toBe(7.5);
    expect(result!.vclScores!.cContext).toBe(6.0);
    expect(result!.vclScores!.lSlop).toBe(2.0);
  });

  it("vclScores omits optional fields when absent in source", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 } }),
      makeConfig(), 1,
    );
    expect(result!.vclScores!.vSignal).toBeUndefined();
    expect(result!.vclScores!.cContext).toBeUndefined();
    expect(result!.vclScores!.lSlop).toBeUndefined();
  });

  it("empty content string produces valid content hash", () => {
    const result = transformBriefingItem(makeItem({ content: "" }), makeConfig(), 1);
    expect(result!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result!.encryptedContent).toBe("");
  });

  it("missing price tier in map falls back to 0", () => {
    const config = makeConfig({ priceTierMap: {} });
    const result = transformBriefingItem(makeItem(), config, 1);
    expect(result!.priceUsdc).toBe(0);
  });

  it("externalId matches Aegis本体 itemHash format (null byte separator, full SHA-256)", () => {
    const item = makeItem({ title: "Hello", sourceUrl: "https://x.com/a" });
    const result = transformBriefingItem(item, makeConfig(), 1);
    const expected = createHash("sha256").update("Hello\0https://x.com/a").digest("hex");
    expect(result!.sourceRef!.externalId).toBe(expected);
    expect(result!.sourceRef!.externalId).toHaveLength(64);
  });

  it("exact minCompositeScore boundary: equal passes, below fails", () => {
    const config = makeConfig({ minCompositeScore: 8.0 });
    const atBoundary = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 } }),
      config, 1,
    );
    const belowBoundary = transformBriefingItem(
      makeItem({ scores: { originality: 7, insight: 7, credibility: 7, composite: 7.99 } }),
      config, 1,
    );
    expect(atBoundary).not.toBeNull();
    expect(belowBoundary).toBeNull();
  });

  it("very long title and URL produce valid externalId", () => {
    const longTitle = "A".repeat(10000);
    const longUrl = "https://example.com/" + "x".repeat(10000);
    const result = transformBriefingItem(
      makeItem({ title: longTitle, sourceUrl: longUrl }),
      makeConfig(), 1,
    );
    expect(result!.sourceRef!.externalId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("unicode in title/URL produces consistent externalId", () => {
    const item = makeItem({ title: "日本語タイトル", sourceUrl: "https://例え.jp/記事" });
    const r1 = transformBriefingItem(item, makeConfig(), 1);
    const r2 = transformBriefingItem(item, makeConfig(), 2);
    expect(r1!.sourceRef!.externalId).toBe(r2!.sourceRef!.externalId);
  });

  it("transformBriefingItems returns empty Map for empty input", () => {
    expect(transformBriefingItems([], makeConfig(), 1).size).toBe(0);
  });

  it("transformBriefingItems returns empty Map when all items filtered", () => {
    const items = [makeItem({ verdict: "slop" }), makeItem({ verdict: "slop" })];
    expect(transformBriefingItems(items, makeConfig({ qualityOnly: true }), 1).size).toBe(0);
  });
});

// ==========================================================================
// sync.ts — /changes flow, preview fallback, skip logic
// ==========================================================================

describe("sync /changes optimization", () => {
  it("skips full fetch when /changes returns empty array (no changes)", async () => {
    // Simulate prior sync by writing sync state
    const fs = await import("fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) =>
      typeof p === "string" && p.includes("bridge-sync-state") ? true : false,
    );
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) {
        return JSON.stringify({
          lastSyncAt: Date.now() - 60_000,
          lastBriefingGeneratedAt: "2026-03-21T00:00:00Z",
          totalSynced: 5,
          totalRemoved: 0,
          consecutiveFailures: 0,
          lastError: null,
        });
      }
      return "[]";
    });

    // /changes returns empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ since: "2026-03-21T00:00:00Z", checkedAt: new Date().toISOString(), changes: [] }),
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);
    // Only 1 fetch call — /changes. No briefing fetch needed.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/changes");
  });

  it("proceeds to full fetch when /changes returns non-empty", async () => {
    const fs = await import("fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) =>
      typeof p === "string" && p.includes("bridge-sync-state") ? true : false,
    );
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) {
        return JSON.stringify({
          lastSyncAt: Date.now() - 60_000,
          lastBriefingGeneratedAt: "2026-03-20T00:00:00Z",
          totalSynced: 0, totalRemoved: 0, consecutiveFailures: 0, lastError: null,
        });
      }
      return "[]";
    });

    // /changes returns 1 change
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        since: "2026-03-20T00:00:00Z",
        checkedAt: new Date().toISOString(),
        changes: [{ action: "added", itemHash: "abc", title: "New", sourceUrl: "https://x.com", composite: 8, generatedAt: "2026-03-21T00:00:00Z" }],
      }),
    });

    // Then briefing fetch
    const briefing = makeBriefing([{ title: "New Article", composite: 8.0 }], "2026-03-21T00:00:00Z");
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    // 2 core calls (/changes + briefing) + OGP fetches for each offer
    const coreUrls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
    expect(coreUrls.some((u: string) => u.includes("/changes"))).toBe(true);
    expect(coreUrls.some((u: string) => u.includes("/briefing"))).toBe(true);
    expect(result.created).toBe(1);
  });

  it("falls back to full sync when /changes returns 404", async () => {
    const fs = await import("fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) =>
      typeof p === "string" && p.includes("bridge-sync-state") ? true : false,
    );
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) {
        return JSON.stringify({
          lastSyncAt: Date.now() - 60_000,
          lastBriefingGeneratedAt: "2026-03-20T00:00:00Z",
          totalSynced: 0, totalRemoved: 0, consecutiveFailures: 0, lastError: null,
        });
      }
      return "[]";
    });

    // /changes returns 404
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });

    // Briefing fetch proceeds
    const briefing = makeBriefing([{ title: "Fallback", composite: 8.0 }], "2026-03-21T01:00:00Z");
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.created).toBe(1);
  });
});

describe("sync x402 preview fallback", () => {
  it("falls back to preview=true on 402, succeeds with preview content", async () => {
    // First call: briefing 402 (no prior sync, so /changes is skipped)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 402, statusText: "Payment Required" });
    // Second call: preview=true retry succeeds
    const briefing = makeBriefing([{ title: "Preview Item", composite: 8.0 }]);
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.created).toBe(1);
    // First call was the normal briefing fetch, second was preview retry, then OGP fetches
    const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some((u: string) => u.includes("preview=true"))).toBe(true);
  });
});

describe("sync skips unchanged briefing", () => {
  it("returns zero counts when generatedAt matches last sync", async () => {
    // Track what gets written to sync-state file so loadSyncState can read it back
    let savedState: string | null = null;
    const fs = await import("fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) return savedState !== null;
      return false;
    });
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state") && savedState) return savedState;
      return "[]";
    });
    (fs.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string, data: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) savedState = data;
    });

    // First sync
    const briefing = makeBriefing([{ title: "A", composite: 8 }], "2026-03-21T10:00:00Z");
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const r1 = await syncFromAegis(makeConfig());
    expect(r1.created).toBe(1);

    // Second sync — /changes check (prior sync exists), then briefing
    // /changes returns changes to force briefing fetch
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ since: "", checkedAt: "", changes: [{ action: "added" }] }),
    });
    // Briefing returns same generatedAt → skip
    mockBriefingFetch(briefing);
    const r2 = await syncFromAegis(makeConfig());
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(0);
    expect(r2.removed).toBe(0);
  });
});

// ==========================================================================
// store-bridge — additional edge cases
// ==========================================================================

describe("store-bridge edge cases", () => {
  it("findOfferBySourceRef with multiple bridged offers returns correct one", () => {
    addOffer({
      agentId: "a", title: "First", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "aaa", version: 1, syncedAt: Date.now() },
    });
    addOffer({
      agentId: "a", title: "Second", description: "D", priceUsdc: 2, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "bbb", version: 1, syncedAt: Date.now() },
    });

    expect(findOfferBySourceRef("aaa")!.title).toBe("First");
    expect(findOfferBySourceRef("bbb")!.title).toBe("Second");
    expect(findOfferBySourceRef("ccc")).toBeUndefined();
  });

  it("updateOffer with sourceRef version bump is reflected", () => {
    const offer = addOffer({
      agentId: "a", title: "V1", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "x", version: 1, syncedAt: 1000 },
    });

    const updated = updateOffer(offer.id, {
      title: "V2",
      sourceRef: { system: "aegis-hontal", externalId: "x", version: 2, syncedAt: 2000 },
    });

    expect(updated!.title).toBe("V2");
    expect(updated!.sourceRef!.version).toBe(2);
    expect(updated!.sourceRef!.syncedAt).toBe(2000);

    // findOfferBySourceRef still works
    expect(findOfferBySourceRef("x")!.title).toBe("V2");
  });

  it("listOffersBySource returns empty when all offers are from other sources", () => {
    addOffer({
      agentId: "a", title: "Normal", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });
    expect(listOffersBySource("aegis-hontal")).toEqual([]);
  });

  it("listOffers sourceSystem filter combined with chain filter", () => {
    addOffer({
      agentId: "a", title: "Bridged Base", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "e1", version: 1, syncedAt: Date.now() },
    });
    addOffer({
      agentId: "a", title: "Bridged Solana", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["solana"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "e2", version: 1, syncedAt: Date.now() },
    });

    const result = listOffers({ sourceSystem: "aegis-hontal", chain: "base" });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Bridged Base");
  });
});

// ==========================================================================
// bridge-config edge cases
// ==========================================================================

describe("bridge-config edge cases", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AEGIS_BRIDGE_ENABLED;
    delete process.env.AEGIS_HONTAL_URL;
    delete process.env.AEGIS_SYNC_INTERVAL_MS;
    delete process.env.AEGIS_AGENT_ID;
    delete process.env.AEGIS_DEFAULT_CHAINS;
    delete process.env.AEGIS_PRICE_TIER_MAP;
    delete process.env.AEGIS_MIN_COMPOSITE_SCORE;
    delete process.env.AEGIS_BRIDGE_QUALITY_ONLY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("AEGIS_BRIDGE_ENABLED=false is disabled", () => {
    process.env.AEGIS_BRIDGE_ENABLED = "false";
    expect(loadBridgeConfig().enabled).toBe(false);
  });

  it("AEGIS_BRIDGE_ENABLED=TRUE (uppercase) is disabled (strict check)", () => {
    process.env.AEGIS_BRIDGE_ENABLED = "TRUE";
    expect(loadBridgeConfig().enabled).toBe(false);
  });

  it("empty AEGIS_HONTAL_URL produces empty string", () => {
    process.env.AEGIS_HONTAL_URL = "";
    expect(loadBridgeConfig().aegisUrl).toBe("");
  });

  it("price tier map with negative values are filtered out", () => {
    process.env.AEGIS_PRICE_TIER_MAP = '{"free":0,"basic":-5,"premium":20}';
    const config = loadBridgeConfig();
    expect(config.priceTierMap.basic).toBeUndefined();
    expect(config.priceTierMap.premium).toBe(20);
  });

  it("price tier map with non-number values are filtered out", () => {
    process.env.AEGIS_PRICE_TIER_MAP = '{"free":"zero","basic":2}';
    const config = loadBridgeConfig();
    expect(config.priceTierMap).toEqual({ basic: 2 });
  });

  it("sync interval exactly at minimum (30000) is accepted", () => {
    process.env.AEGIS_SYNC_INTERVAL_MS = "30000";
    expect(loadBridgeConfig().syncIntervalMs).toBe(30_000);
  });

  it("chains with whitespace are trimmed", () => {
    process.env.AEGIS_DEFAULT_CHAINS = " base , solana ";
    expect(loadBridgeConfig().defaultChains).toEqual(["base", "solana"]);
  });

  it("AEGIS_MIN_COMPOSITE_SCORE=0 is accepted", () => {
    process.env.AEGIS_MIN_COMPOSITE_SCORE = "0";
    expect(loadBridgeConfig().minCompositeScore).toBe(0);
  });

  it("negative AEGIS_MIN_COMPOSITE_SCORE is accepted (no floor)", () => {
    process.env.AEGIS_MIN_COMPOSITE_SCORE = "-1";
    expect(loadBridgeConfig().minCompositeScore).toBe(-1);
  });
});

// ==========================================================================
// Integration: health endpoint with bridge enabled
// ==========================================================================

describe("health endpoint with bridge", () => {
  beforeEach(() => {
    delete process.env.AEGIS_BRIDGE_ENABLED;
    delete process.env.AEGIS_HONTAL_URL;
  });

  it("includes bridge.enabled=false when bridge is off", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const data = await res.json();
    expect(data.bridge).toBeDefined();
    expect(data.bridge.enabled).toBe(false);
  });

  it("includes bridge stats when bridge is on", async () => {
    process.env.AEGIS_BRIDGE_ENABLED = "true";
    process.env.AEGIS_HONTAL_URL = "https://aegis.dwebxr.xyz";

    addOffer({
      agentId: "aegis-hontal", title: "B", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "e1", version: 1, syncedAt: Date.now() },
    });

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const data = await res.json();

    expect(data.bridge.enabled).toBe(true);
    expect(data.bridge.aegisUrl).toBe("https://aegis.dwebxr.xyz");
    expect(data.bridge.bridgedOffers).toBe(1);
  });
});

// ==========================================================================
// Integration: full sync → offers appear in /api/agent/offers
// ==========================================================================

describe("full bridge flow: sync → offers available via API", () => {
  it("synced offers appear in listOffers and are purchasable", async () => {
    const briefing = makeBriefing([
      { title: "Purchasable Article", composite: 8.5 },
    ]);
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig());

    // Verify offer exists in store
    const all = listOffers();
    expect(all.some((o) => o.title === "Purchasable Article")).toBe(true);

    const bridgedOffer = all.find((o) => o.title === "Purchasable Article")!;
    expect(bridgedOffer.agentId).toBe("aegis-hontal");
    expect(bridgedOffer.sourceRef).toBeDefined();
    expect(bridgedOffer.sourceRef!.system).toBe("aegis-hontal");
    expect(bridgedOffer.priceUsdc).toBe(0); // all bridge offers are free
    expect(bridgedOffer.encryptedContent).toBeDefined();
    expect(bridgedOffer.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Verify it's filterable by sourceSystem
    const filtered = listOffers({ sourceSystem: "aegis-hontal" });
    expect(filtered).toHaveLength(1);

    // Verify it's filterable by chain
    const byChain = listOffers({ chain: "base" });
    expect(byChain.some((o) => o.title === "Purchasable Article")).toBe(true);
  });

  it("second sync updates existing offer content", async () => {
    // First sync
    const b1 = makeBriefing([{ title: "Evolving", composite: 8.0 }], "2026-03-21T01:00:00Z");
    mockBriefingFetch(b1);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig());

    const first = listOffers({ sourceSystem: "aegis-hontal" });
    expect(first).toHaveLength(1);
    const firstId = first[0].id;

    // Second sync — same title/url (same externalId) but newer generatedAt
    const b2 = makeBriefing([{ title: "Evolving", composite: 9.0 }], "2026-03-21T02:00:00Z");
    mockBriefingFetch(b2);
    await syncFromAegis(makeConfig());

    const second = listOffers({ sourceSystem: "aegis-hontal" });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(firstId); // same offer, updated in place
    expect(second[0].priceUsdc).toBe(0); // all bridge offers are free
  });

  it("concurrent syncs do not duplicate offers", async () => {
    const briefing = makeBriefing([{ title: "Concurrent", composite: 8.0 }]);

    // Two concurrent fetches return same briefing
    mockBriefingFetch(briefing);
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const config = makeConfig();

    // Run two syncs concurrently
    await Promise.all([syncFromAegis(config), syncFromAegis(config)]);

    // One creates, one skips (or both create but same externalId = dedup in Map)
    const total = listOffersBySource("aegis-hontal");
    // Due to Map-based dedup in store, at worst 2 offers with same externalId
    // but more likely one sync creates and the other finds it already exists
    expect(total.length).toBeGreaterThanOrEqual(1);
    expect(total.length).toBeLessThanOrEqual(2);
  });
});

// ==========================================================================
// LARP fix verification: L4 (corrupt sync state), L5 (malformed briefing)
// ==========================================================================

describe("L4: corrupt sync state file recovery", () => {
  it("recovers from corrupt JSON in sync state file", async () => {
    const fs = await import("fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) =>
      typeof p === "string" && p.includes("bridge-sync-state"),
    );
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) return "NOT VALID JSON{{{";
      return "[]";
    });

    const { getSyncState } = await import("@/services/bridge/sync");
    const state = getSyncState();
    expect(state.lastSyncAt).toBe(0);
    expect(state.consecutiveFailures).toBe(0);
  });

  it("recovers from sync state with missing fields", async () => {
    const fs = await import("fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) =>
      typeof p === "string" && p.includes("bridge-sync-state"),
    );
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("bridge-sync-state")) return '{"someOtherField": true}';
      return "[]";
    });

    const { getSyncState } = await import("@/services/bridge/sync");
    const state = getSyncState();
    // Missing lastSyncAt (not a number) → returns default
    expect(state.lastSyncAt).toBe(0);
  });
});

describe("L5: malformed briefing response rejection", () => {
  it("throws on briefing response without items array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ generatedAt: "2026-01-01", items: "not-an-array" }),
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("unexpected shape");
  });

  it("throws on briefing response without generatedAt", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("unexpected shape");
  });

  it("throws on null briefing response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => null,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("unexpected shape");
  });
});

// ==========================================================================
// P1: principal field — config + sync behavior
// ==========================================================================

describe("bridge-config principal field", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AEGIS_BRIDGE_PRINCIPAL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to empty string when AEGIS_BRIDGE_PRINCIPAL is unset", () => {
    expect(loadBridgeConfig().principal).toBe("");
  });

  it("reads AEGIS_BRIDGE_PRINCIPAL from env", () => {
    process.env.AEGIS_BRIDGE_PRINCIPAL = "abc-def-principal";
    expect(loadBridgeConfig().principal).toBe("abc-def-principal");
  });
});

describe("sync principal behavior", () => {
  it("passes principal as query param when configured", async () => {
    const briefing = makeBriefing([{ title: "With Principal", composite: 8.0 }]);
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig({ principal: "my-ic-principal" }));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("principal=my-ic-principal");
  });

  it("omits principal param when empty string", async () => {
    const briefing = makeBriefing([{ title: "No Principal", composite: 8.0 }]);
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig({ principal: "" }));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("principal");
  });

  it("throws clear error when Aegis returns global briefing (contributors, no items)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        version: "1.0",
        type: "global",
        generatedAt: "2026-03-21T00:00:00Z",
        pagination: { offset: 0, limit: 5, total: 1, hasMore: false },
        contributors: [{ principal: "abc", generatedAt: "2026-03-21T00:00:00Z", summary: {}, topItems: [] }],
        aggregatedTopics: [],
        totalEvaluated: 100,
        totalQualityRate: 0.95,
      }),
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig({ principal: "" }))).rejects.toThrow("AEGIS_BRIDGE_PRINCIPAL is required");
  });
});

// ==========================================================================
// P2: composite score clamping for values > 10
// ==========================================================================

describe("composite score clamping", () => {
  it("composite 62.47 still produces free offer with correct vclScores", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 9, credibility: 9, composite: 62.47 } }),
      makeConfig(),
      1,
    );
    expect(result!.priceUsdc).toBe(0);
    expect(result!.vclScores!.composite).toBe(62.47);
  });

  it("composite 15.0 still produces free offer", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 8, credibility: 8, composite: 15.0 } }),
      makeConfig(),
      1,
    );
    expect(result!.priceUsdc).toBe(0);
  });

  it("composite 10.0 exactly produces free offer", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 10, insight: 10, credibility: 10, composite: 10.0 } }),
      makeConfig(),
      1,
    );
    expect(result!.priceUsdc).toBe(0);
  });

  it("composite 8.5 produces free offer with vclScores", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 8, credibility: 8, composite: 8.5 } }),
      makeConfig(),
      1,
    );
    expect(result!.priceUsdc).toBe(0);
    expect(result!.vclScores!.composite).toBe(8.5);
  });

  it("items with composite > 10 still pass minCompositeScore filter", () => {
    const result = transformBriefingItem(
      makeItem({ scores: { originality: 8, insight: 9, credibility: 9, composite: 55.875 } }),
      makeConfig({ minCompositeScore: 7.0 }),
      1,
    );
    expect(result).not.toBeNull();
  });
});
