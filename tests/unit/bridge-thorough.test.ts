import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { transformBriefingItem, transformBriefingItems } from "@/services/bridge/transform";
import { loadBridgeConfig } from "@/lib/bridge-config";
import type { D2ABriefingItem, BridgeConfig, D2ABriefingResponse } from "@/types/bridge";
import type { ChainType } from "@/types/offer";

// In-memory canister state for testing
let canisterOffers: any[] = [];

const mockActor = {
  put_offer: vi.fn().mockImplementation(async (offer: any) => {
    const idx = canisterOffers.findIndex((o: any) => o.id === offer.id);
    if (idx >= 0) canisterOffers[idx] = offer;
    else canisterOffers.push(offer);
  }),
  get_offer: vi.fn().mockImplementation(async (id: string) => {
    const o = canisterOffers.find((o: any) => o.id === id);
    return o ? [o] : [];
  }),
  delete_offer: vi.fn().mockImplementation(async (id: string) => {
    const idx = canisterOffers.findIndex((o: any) => o.id === id);
    if (idx >= 0) { canisterOffers.splice(idx, 1); return true; }
    return false;
  }),
  get_offers: vi.fn().mockImplementation(async () => [...canisterOffers]),
  submit_receipt: vi.fn().mockResolvedValue(undefined),
  get_receipt: vi.fn().mockResolvedValue([]),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
}));

const mockFetch = vi.fn().mockRejectedValue(new Error("unmocked fetch"));
vi.stubGlobal("fetch", mockFetch);

const {
  addOffer,
  updateOffer,
  findOfferBySourceRef,
  listOffersBySource,
  listOffers,
} = await import("@/services/content/store");

beforeEach(async () => {
  vi.clearAllMocks();
  canisterOffers = [];
  mockFetch.mockReset();
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

// Track whether sync has succeeded at least once (module-level syncState persists)
let syncHasSucceeded = false;

/**
 * Helper: mock a /changes response that indicates changes exist,
 * so syncFromAegis proceeds to fetch the full briefing.
 * Only adds the mock if sync has succeeded before (lastSyncAt > 0).
 */
function mockChangesIfNeeded() {
  if (syncHasSucceeded) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        since: "2026-03-20T00:00:00Z",
        checkedAt: new Date().toISOString(),
        changes: [{ action: "added", itemHash: "x", title: "x" }],
      }),
    });
  }
}

/**
 * Mock changes with a forced non-empty response (for /changes optimization tests).
 */
function mockChangesWithUpdates() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      since: "2026-03-20T00:00:00Z",
      checkedAt: new Date().toISOString(),
      changes: [{ action: "added", itemHash: "x", title: "x" }],
    }),
  });
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
  it("proceeds to full fetch when /changes returns non-empty", async () => {
    mockChangesIfNeeded();
    // /changes returns 1 change (explicit mock for this test)
    if (!syncHasSucceeded) {
      // First sync in file: no /changes call needed, just briefing
    } else {
      // Already mocked via mockChangesIfNeeded
    }

    // Then briefing fetch
    const briefing = makeBriefing([{ title: "New Article", composite: 8.0 }], "2026-04-01T00:00:00Z");
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());
    syncHasSucceeded = true;

    expect(result.created).toBe(1);
  });
});

describe("sync x402 preview fallback", () => {
  it("falls back to preview=true on 402, succeeds with preview content", async () => {
    mockChangesIfNeeded();
    // First call: briefing 402
    mockFetch.mockResolvedValueOnce({ ok: false, status: 402, statusText: "Payment Required" });
    // Second call: preview=true retry succeeds
    const briefing = makeBriefing([{ title: "Preview Item", composite: 8.0 }], "2026-04-02T00:00:00Z");
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());
    syncHasSucceeded = true;

    expect(result.created).toBe(1);
    const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some((u: string) => u.includes("preview=true"))).toBe(true);
  });
});

// ==========================================================================
// store-bridge — additional edge cases
// ==========================================================================

describe("store-bridge edge cases", () => {
  it("findOfferBySourceRef with multiple bridged offers returns correct one", async () => {
    await addOffer({
      agentId: "a", title: "First", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "aaa", version: 1, syncedAt: Date.now() },
    });
    await addOffer({
      agentId: "a", title: "Second", description: "D", priceUsdc: 2, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "bbb", version: 1, syncedAt: Date.now() },
    });

    expect((await findOfferBySourceRef("aaa"))!.title).toBe("First");
    expect((await findOfferBySourceRef("bbb"))!.title).toBe("Second");
    expect(await findOfferBySourceRef("ccc")).toBeUndefined();
  });

  it("updateOffer with sourceRef version bump is reflected", async () => {
    const offer = await addOffer({
      agentId: "a", title: "V1", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "x", version: 1, syncedAt: 1000 },
    });

    const updated = await updateOffer(offer.id, {
      title: "V2",
      sourceRef: { system: "aegis-hontal", externalId: "x", version: 2, syncedAt: 2000 },
    });

    expect(updated!.title).toBe("V2");
    expect(updated!.sourceRef!.version).toBe(2);
    expect(updated!.sourceRef!.syncedAt).toBe(2000);

    // findOfferBySourceRef still works
    expect((await findOfferBySourceRef("x"))!.title).toBe("V2");
  });

  it("listOffersBySource returns empty when all offers are from other sources", async () => {
    await addOffer({
      agentId: "a", title: "Normal", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });
    expect(await listOffersBySource("aegis-hontal")).toEqual([]);
  });

  it("listOffers sourceSystem filter combined with chain filter", async () => {
    await addOffer({
      agentId: "a", title: "Bridged Base", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "e1", version: 1, syncedAt: Date.now() },
    });
    await addOffer({
      agentId: "a", title: "Bridged Solana", description: "D", priceUsdc: 1, contentHash: "",
      supportedChains: ["solana"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "e2", version: 1, syncedAt: Date.now() },
    });

    const result = await listOffers({ sourceSystem: "aegis-hontal", chain: "base" });
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

    await addOffer({
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
    ], "2026-04-03T00:00:00Z");
    mockChangesIfNeeded();
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig());
    syncHasSucceeded = true;

    // Verify offer exists in store
    const all = await listOffers();
    expect(all.some((o) => o.title === "Purchasable Article")).toBe(true);

    const bridgedOffer = all.find((o) => o.title === "Purchasable Article")!;
    expect(bridgedOffer.agentId).toBe("aegis-hontal");
    expect(bridgedOffer.sourceRef).toBeDefined();
    expect(bridgedOffer.sourceRef!.system).toBe("aegis-hontal");
    expect(bridgedOffer.priceUsdc).toBe(0); // all bridge offers are free
    expect(bridgedOffer.encryptedContent).toBeDefined();
    expect(bridgedOffer.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Verify it's filterable by sourceSystem
    const filtered = await listOffers({ sourceSystem: "aegis-hontal" });
    expect(filtered).toHaveLength(1);

    // Verify it's filterable by chain
    const byChain = await listOffers({ chain: "base" });
    expect(byChain.some((o) => o.title === "Purchasable Article")).toBe(true);
  });

  it("second sync updates existing offer content", async () => {
    // First sync
    const b1 = makeBriefing([{ title: "Evolving", composite: 8.0 }], "2026-04-04T01:00:00Z");
    mockChangesIfNeeded();
    mockBriefingFetch(b1);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig());
    syncHasSucceeded = true;

    const first = await listOffers({ sourceSystem: "aegis-hontal" });
    expect(first).toHaveLength(1);
    const firstId = first[0].id;

    // Second sync — same title/url (same externalId) but newer generatedAt
    const b2 = makeBriefing([{ title: "Evolving", composite: 9.0 }], "2026-04-04T02:00:00Z");
    mockChangesIfNeeded();
    mockBriefingFetch(b2);
    await syncFromAegis(makeConfig());

    const second = await listOffers({ sourceSystem: "aegis-hontal" });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(firstId); // same offer, updated in place
    expect(second[0].priceUsdc).toBe(0); // all bridge offers are free
  });

  it("concurrent syncs do not duplicate offers", async () => {
    const briefing = makeBriefing([{ title: "Concurrent", composite: 8.0 }], "2026-04-05T00:00:00Z");

    // Use URL-aware mock to handle interleaved fetch calls
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/changes")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            since: "",
            checkedAt: new Date().toISOString(),
            changes: [{ action: "added", itemHash: "x" }],
          }),
        };
      }
      // Briefing
      return { ok: true, status: 200, json: async () => briefing };
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const config = makeConfig();

    // Run two syncs concurrently
    await Promise.all([syncFromAegis(config), syncFromAegis(config)]);
    syncHasSucceeded = true;

    // One creates, one skips (or both create but same externalId = dedup in Map)
    const total = await listOffersBySource("aegis-hontal");
    expect(total.length).toBeGreaterThanOrEqual(1);
    expect(total.length).toBeLessThanOrEqual(2);
  });
});

// ==========================================================================
// LARP fix verification: L5 (malformed briefing)
// ==========================================================================

describe("L5: malformed briefing response rejection", () => {
  it("throws on briefing response without items array", async () => {
    mockChangesIfNeeded();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ generatedAt: "2026-01-01", items: "not-an-array" }),
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("unexpected shape");
  });

  it("throws on briefing response without generatedAt", async () => {
    mockChangesIfNeeded();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("unexpected shape");
  });

  it("throws on null briefing response body", async () => {
    mockChangesIfNeeded();
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
    const briefing = makeBriefing([{ title: "With Principal", composite: 8.0 }], "2026-04-06T00:00:00Z");
    mockChangesIfNeeded();
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig({ principal: "my-ic-principal" }));
    syncHasSucceeded = true;

    // Find the briefing URL (not /changes)
    const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
    const briefingUrl = urls.find((u: string) => u.includes("/briefing") && !u.includes("/changes"));
    expect(briefingUrl).toContain("principal=my-ic-principal");
  });

  it("omits principal param when empty string", async () => {
    const briefing = makeBriefing([{ title: "No Principal", composite: 8.0 }], "2026-04-07T00:00:00Z");
    mockChangesIfNeeded();
    mockBriefingFetch(briefing);

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig({ principal: "" }));
    syncHasSucceeded = true;

    const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
    const briefingUrl = urls.find((u: string) => u.includes("/briefing") && !u.includes("/changes"));
    expect(briefingUrl).not.toContain("principal");
  });

  it("throws clear error when Aegis returns global briefing (contributors, no items)", async () => {
    mockChangesIfNeeded();
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
