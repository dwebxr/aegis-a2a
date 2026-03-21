import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addOffer,
  listOffersBySource,
  findOfferBySourceRef,
  _resetForTesting,
} from "@/services/content/store";
import type { ChainType } from "@/types/offer";
import type { D2ABriefingResponse, BridgeConfig, SourceRef } from "@/types/bridge";

// Mock fs — include default export for `import fs from "fs"` and named exports
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

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

function makeBriefingResponse(
  items: Array<{ title: string; composite: number }>,
  generatedAt = "2026-03-21T00:00:00Z",
): D2ABriefingResponse {
  return {
    version: "1.0",
    generatedAt,
    source: "aegis",
    sourceUrl: "https://aegis.dwebxr.xyz",
    summary: { totalEvaluated: items.length * 2, totalBurned: items.length, qualityRate: 0.5 },
    items: items.map((i) => ({
      title: i.title,
      content: `Content for ${i.title}`,
      source: "nostr",
      sourceUrl: `https://example.com/${i.title.toLowerCase().replace(/\s+/g, "-")}`,
      scores: {
        originality: i.composite,
        insight: i.composite,
        credibility: i.composite,
        composite: i.composite,
      },
      verdict: "quality" as const,
      reason: "Good content",
      topics: ["test"],
      briefingScore: i.composite * 10,
    })),
    serendipityPick: null,
    meta: { scoringModel: "test", nostrPubkey: null, topics: ["test"] },
  };
}

beforeEach(() => {
  _resetForTesting();
  mockFetch.mockReset();
});

describe("syncFromAegis", () => {
  it("creates new offers from briefing items", async () => {
    const briefing = makeBriefingResponse([
      { title: "Article A", composite: 8.0 },
      { title: "Article B", composite: 9.5 },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => briefing,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const config = makeConfig();
    const result = await syncFromAegis(config);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);

    const bridged = listOffersBySource("aegis-hontal");
    expect(bridged).toHaveLength(2);
    expect(bridged.some((o) => o.title === "Article A")).toBe(true);
    expect(bridged.some((o) => o.title === "Article B")).toBe(true);
  });

  it("updates existing offers when version is newer", async () => {
    // Pre-create a bridged offer
    const ref: SourceRef = { system: "aegis-hontal", externalId: "", version: 1000, syncedAt: Date.now() };
    // We need to know the externalId — derive it the same way transform does
    const { createHash } = await import("crypto");
    const externalId = createHash("sha256").update("Article A\0https://example.com/article-a").digest("hex");
    ref.externalId = externalId;

    addOffer({
      agentId: "aegis-hontal",
      title: "Article A OLD",
      description: "old desc",
      priceUsdc: 2,
      contentHash: "old",
      supportedChains: ["base"] as ChainType[],
      sourceRef: ref,
    });

    const briefing = makeBriefingResponse(
      [{ title: "Article A", composite: 8.0 }],
      "2026-03-22T00:00:00Z", // newer
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => briefing,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);

    const updated = findOfferBySourceRef(externalId);
    expect(updated).toBeDefined();
    expect(updated!.title).toBe("Article A");
  });

  it("removes stale offers no longer in briefing", async () => {
    // Pre-create two bridged offers
    addOffer({
      agentId: "aegis-hontal",
      title: "Will Stay",
      description: "d",
      priceUsdc: 2,
      contentHash: "h",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "stay-id", version: 1, syncedAt: Date.now() },
    });
    addOffer({
      agentId: "aegis-hontal",
      title: "Will Be Removed",
      description: "d",
      priceUsdc: 2,
      contentHash: "h",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "remove-id", version: 1, syncedAt: Date.now() },
    });

    // Briefing only contains one item that doesn't match either existing externalId
    const briefing = makeBriefingResponse(
      [{ title: "Brand New Item", composite: 8.0 }],
      "2026-03-23T00:00:00Z",
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => briefing,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.removed).toBe(2);
    expect(result.created).toBe(1);
    expect(listOffersBySource("aegis-hontal")).toHaveLength(1);
  });

  it("does not touch non-bridged offers", async () => {
    // A regular agent offer
    addOffer({
      agentId: "openclaw",
      title: "Agent Offer",
      description: "d",
      priceUsdc: 5,
      contentHash: "h",
      supportedChains: ["base"] as ChainType[],
    });

    const briefing = makeBriefingResponse(
      [{ title: "New Briefing", composite: 8.0 }],
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => briefing,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await syncFromAegis(makeConfig());

    // Agent offer should still exist
    const all = listOffersBySource("aegis-hontal");
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("New Briefing");

    // The openclaw offer is untouched (not sourced from aegis-hontal)
    const { listOffers } = await import("@/services/content/store");
    const allOffers = listOffers();
    expect(allOffers.some((o) => o.agentId === "openclaw")).toBe(true);
  });

  it("filters out items below minCompositeScore", async () => {
    const briefing = makeBriefingResponse([
      { title: "High Quality", composite: 9.0 },
      { title: "Low Quality", composite: 5.0 },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => briefing,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.created).toBe(1);
    expect(listOffersBySource("aegis-hontal")).toHaveLength(1);
    expect(listOffersBySource("aegis-hontal")[0].title).toBe("High Quality");
  });

  it("includes serendipity pick", async () => {
    const briefing = makeBriefingResponse([
      { title: "Regular", composite: 8.0 },
    ]);
    briefing.serendipityPick = {
      title: "Serendipity",
      content: "Surprise content",
      source: "nostr",
      sourceUrl: "https://example.com/serendipity",
      scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 },
      verdict: "quality",
      reason: "Serendipitous find",
      topics: ["surprise"],
      briefingScore: 80,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => briefing,
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    const result = await syncFromAegis(makeConfig());

    expect(result.created).toBe(2);
    const bridged = listOffersBySource("aegis-hontal");
    expect(bridged.some((o) => o.title === "Serendipity")).toBe(true);
  });

  it("throws on 402 payment required when preview also fails", async () => {
    // First call: 402 on normal briefing
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      statusText: "Payment Required",
    });
    // Second call: 402 on preview=true retry
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      statusText: "Payment Required",
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("x402 payment");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const { syncFromAegis } = await import("@/services/bridge/sync");
    await expect(syncFromAegis(makeConfig())).rejects.toThrow("500");
  });
});

describe("runSyncCycle", () => {
  it("returns null when bridge is disabled", async () => {
    const { runSyncCycle } = await import("@/services/bridge/sync");
    const result = await runSyncCycle(makeConfig({ enabled: false }));
    expect(result).toBeNull();
  });

  it("returns null when aegisUrl is empty", async () => {
    const { runSyncCycle } = await import("@/services/bridge/sync");
    const result = await runSyncCycle(makeConfig({ aegisUrl: "" }));
    expect(result).toBeNull();
  });

  it("returns null and logs error on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { runSyncCycle } = await import("@/services/bridge/sync");
    const result = await runSyncCycle(makeConfig());
    expect(result).toBeNull();
  });
});
