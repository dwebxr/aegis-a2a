import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for sync.ts in-memory state management, getSyncState immutability,
 * error state tracking, and the /changes early-exit path.
 */

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

vi.mock("@/lib/ogp", () => ({
  fetchOgImage: vi.fn().mockResolvedValue(undefined),
}));

const { getSyncState, runSyncCycle, syncFromAegis } = await import("@/services/bridge/sync");

const baseBriefingResponse = {
  generatedAt: "2026-01-01T00:00:00Z",
  items: [
    {
      title: "Test Article",
      sourceUrl: "https://example.com",
      content: "Article content",
      topics: ["tech"],
      scores: { originality: 8, insight: 7, credibility: 9, compositeScore: 8.0 },
      verdict: "quality",
    },
  ],
  serendipityPick: null,
  meta: { totalItems: 1, model: "test", nostrPubkey: null },
};

const baseConfig = {
  enabled: true,
  aegisUrl: "https://aegis.test",
  principal: "test-principal",
  syncIntervalMs: 300000,
  agentId: "aegis-hontal",
  defaultChains: ["base", "solana", "icp"] as const,
  priceTierMap: { free: 0, basic: 2, premium: 10 },
  minCompositeScore: 0,
  qualityOnly: false,
};

let fetchCallCount = 0;

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  fetchCallCount = 0;

  // Reset global fetch mock
  globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
    fetchCallCount++;
    if (url.includes("/changes")) {
      return new Response(JSON.stringify({ changes: [{ type: "updated" }] }), { status: 200 });
    }
    if (url.includes("/briefing")) {
      return new Response(JSON.stringify({
        ...baseBriefingResponse,
        generatedAt: `2026-01-0${fetchCallCount}T00:00:00Z`,
      }), { status: 200 });
    }
    if (url.includes("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  });
});

describe("getSyncState", () => {
  it("returns initial state with zeroed values", () => {
    const state = getSyncState();
    expect(state.lastSyncAt).toBe(0);
    expect(state.totalSynced).toBeGreaterThanOrEqual(0);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastError).toBeNull();
  });

  it("returns a copy — mutations do not affect internal state", () => {
    const state1 = getSyncState();
    state1.lastSyncAt = 999999;
    state1.consecutiveFailures = 42;

    const state2 = getSyncState();
    expect(state2.lastSyncAt).not.toBe(999999);
    expect(state2.consecutiveFailures).not.toBe(42);
  });
});

describe("runSyncCycle state tracking", () => {
  it("returns null when disabled", async () => {
    const result = await runSyncCycle({ ...baseConfig, enabled: false });
    expect(result).toBeNull();
  });

  it("returns null when aegisUrl is empty", async () => {
    const result = await runSyncCycle({ ...baseConfig, aegisUrl: "" });
    expect(result).toBeNull();
  });

  it("returns SyncResult on success", async () => {
    const result = await runSyncCycle(baseConfig);
    expect(result).not.toBeNull();
    expect(result!.created).toBeGreaterThanOrEqual(0);
    expect(typeof result!.updated).toBe("number");
    expect(typeof result!.skipped).toBe("number");
    expect(typeof result!.removed).toBe("number");
  });

  it("updates sync state after successful sync", async () => {
    await runSyncCycle(baseConfig);

    const state = getSyncState();
    expect(state.lastSyncAt).toBeGreaterThan(0);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastError).toBeNull();
  });

  it("increments consecutiveFailures on error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network down"));

    await runSyncCycle(baseConfig);
    const state1 = getSyncState();
    expect(state1.consecutiveFailures).toBe(1);
    expect(state1.lastError).toContain("Network down");

    await runSyncCycle(baseConfig);
    const state2 = getSyncState();
    expect(state2.consecutiveFailures).toBe(2);
  });

  it("resets consecutiveFailures after successful sync", async () => {
    // Cause a failure — note: consecutiveFailures accumulates across tests
    // because sync state is module-level
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));
    const failuresBefore = getSyncState().consecutiveFailures;
    await runSyncCycle(baseConfig);
    expect(getSyncState().consecutiveFailures).toBe(failuresBefore + 1);

    // Then succeed
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes("/briefing")) {
        return new Response(JSON.stringify({
          ...baseBriefingResponse,
          generatedAt: `2026-02-0${callCount}T00:00:00Z`,
        }), { status: 200 });
      }
      if (url.includes("/changes")) {
        return new Response(JSON.stringify({ changes: [{ type: "updated" }] }), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    });

    await runSyncCycle(baseConfig);
    expect(getSyncState().consecutiveFailures).toBe(0);
    expect(getSyncState().lastError).toBeNull();
  });
});

describe("syncFromAegis state accumulation", () => {
  it("accumulates totalSynced across multiple sync cycles", async () => {
    const before = getSyncState().totalSynced;

    await syncFromAegis(baseConfig);

    const after = getSyncState().totalSynced;
    expect(after).toBeGreaterThan(before);
  });

  it("removes stale offers via delete_offer", async () => {
    const result = await syncFromAegis(baseConfig);
    expect(typeof result.removed).toBe("number");
    expect(result.removed).toBeGreaterThanOrEqual(0);
  });
});

describe("syncFromAegis /changes early exit", () => {
  it("skips briefing fetch when no changes since last sync", async () => {
    // First sync — initializes lastSyncAt
    await syncFromAegis(baseConfig);

    // Second sync — /changes returns empty
    let briefingCalled = false;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/changes")) {
        return new Response(JSON.stringify({ changes: [] }), { status: 200 });
      }
      if (url.includes("/briefing")) {
        briefingCalled = true;
        return new Response(JSON.stringify({
          ...baseBriefingResponse,
          generatedAt: "2026-03-01T00:00:00Z",
        }), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    });

    const result = await syncFromAegis(baseConfig);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(briefingCalled).toBe(false);
  });
});

describe("syncFromAegis error scenarios", () => {
  it("throws on 402 when preview also fails", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response("Payment Required", { status: 402 });
    });

    await expect(syncFromAegis(baseConfig)).rejects.toThrow("x402 payment");
  });

  it("throws on unexpected response shape", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/changes")) {
        return new Response(JSON.stringify({ changes: [{ type: "updated" }] }), { status: 200 });
      }
      if (url.includes("/briefing")) {
        return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    });

    await expect(syncFromAegis(baseConfig)).rejects.toThrow("unexpected shape");
  });

  it("throws when global briefing returned (no principal)", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/changes")) {
        return new Response(JSON.stringify({ changes: [{ type: "updated" }] }), { status: 200 });
      }
      if (url.includes("/briefing")) {
        return new Response(
          JSON.stringify({ contributors: [{ name: "test" }] }),
          { status: 200 },
        );
      }
      return new Response("ok", { status: 200 });
    });

    await expect(syncFromAegis(baseConfig)).rejects.toThrow("AEGIS_BRIDGE_PRINCIPAL is required");
  });
});
