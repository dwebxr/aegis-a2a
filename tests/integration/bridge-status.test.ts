import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetForTesting, addOffer } from "@/services/content/store";
import type { ChainType } from "@/types/offer";

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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeReq(url: string, method = "GET") {
  const { NextRequest } = require("next/server");
  return new NextRequest(url, { method });
}

beforeEach(() => {
  _resetForTesting();
  mockFetch.mockReset();
  delete process.env.AEGIS_BRIDGE_ENABLED;
  delete process.env.AEGIS_HONTAL_URL;
});

describe("GET /api/bridge/status", () => {
  it("returns disabled status when bridge is off", async () => {
    const { GET } = await import("@/app/api/bridge/status/route");
    const res = await GET(makeReq("http://localhost:3000/api/bridge/status"));
    const data = await res.json();

    expect(data.enabled).toBe(false);
    expect(data.aegisUrl).toBeNull();
    expect(data.syncState).toBeNull();
    expect(data.localStats.totalBridgedOffers).toBe(0);
  });

  it("returns enabled status with stats when bridge is on", async () => {
    process.env.AEGIS_BRIDGE_ENABLED = "true";
    process.env.AEGIS_HONTAL_URL = "https://aegis.dwebxr.xyz";

    addOffer({
      agentId: "aegis-hontal",
      title: "Bridged",
      description: "d",
      priceUsdc: 2,
      contentHash: "h",
      supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "ext-1", version: 1, syncedAt: Date.now() },
    });

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { GET } = await import("@/app/api/bridge/status/route");
    const res = await GET(makeReq("http://localhost:3000/api/bridge/status"));
    const data = await res.json();

    expect(data.enabled).toBe(true);
    expect(data.aegisUrl).toBe("https://aegis.dwebxr.xyz");
    expect(data.localStats.totalBridgedOffers).toBe(1);
    expect(data.aegisHealth).toBeNull();
  });
});

describe("POST /api/bridge/sync", () => {
  it("returns 404 when bridge is disabled", async () => {
    const { POST } = await import("@/app/api/bridge/sync/route");
    const res = await POST(makeReq("http://localhost:3000/api/bridge/sync", "POST"));
    expect(res.status).toBe(404);
  });

  it("returns sync results on success", async () => {
    process.env.AEGIS_BRIDGE_ENABLED = "true";
    process.env.AEGIS_HONTAL_URL = "https://aegis.dwebxr.xyz";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        version: "1.0",
        generatedAt: "2026-03-21T12:00:00Z",
        source: "aegis",
        sourceUrl: "https://aegis.dwebxr.xyz",
        summary: { totalEvaluated: 10, totalBurned: 5, qualityRate: 0.5 },
        items: [{
          title: "Synced Item",
          content: "Content here",
          source: "nostr",
          sourceUrl: "https://example.com/synced",
          scores: { originality: 8, insight: 8, credibility: 8, composite: 8.0 },
          verdict: "quality",
          reason: "Good",
          topics: ["test"],
          briefingScore: 80,
        }],
        serendipityPick: null,
        meta: { scoringModel: "test", nostrPubkey: null, topics: ["test"] },
      }),
    });

    const { POST } = await import("@/app/api/bridge/sync/route");
    const res = await POST(makeReq("http://localhost:3000/api/bridge/sync", "POST"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.created).toBe(1);
  });

  it("returns 502 on sync failure", async () => {
    process.env.AEGIS_BRIDGE_ENABLED = "true";
    process.env.AEGIS_HONTAL_URL = "https://aegis.dwebxr.xyz";

    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const { POST } = await import("@/app/api/bridge/sync/route");
    const res = await POST(makeReq("http://localhost:3000/api/bridge/sync", "POST"));
    expect(res.status).toBe(502);
  });
});
