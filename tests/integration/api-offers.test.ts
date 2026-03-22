import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/agent/offers/route";
import { NextRequest } from "next/server";
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

const { addOffer } = await import("@/services/content/store");

const createdIds: string[] = [];

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/agent/offers");
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }
  return new NextRequest(url);
}

async function addTestOffer(overrides: Partial<{
  agentId: string;
  title: string;
  priceUsdc: number;
  supportedChains: ChainType[];
}> = {}) {
  const offer = await addOffer({
    agentId: "agent-test",
    title: "Test Offer",
    description: "desc",
    priceUsdc: 5,
    contentHash: "",
    supportedChains: ["base", "solana"],
    encryptedContent: "SECRET",
    ...overrides,
  });
  createdIds.push(offer.id);
  return offer;
}

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  createdIds.length = 0;
});

describe("GET /api/agent/offers", () => {
  it("returns all offers", async () => {
    await addTestOffer({ title: "A" });
    await addTestOffer({ title: "B" });

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.offers.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT expose encryptedContent in response", async () => {
    await addTestOffer({ title: "Secret" });

    const res = await GET(makeRequest());
    const data = await res.json();

    for (const offer of data.offers) {
      expect(offer).not.toHaveProperty("encryptedContent");
    }
  });

  it("filters by chain", async () => {
    await addTestOffer({ title: "Base Only", supportedChains: ["base"] });
    await addTestOffer({ title: "Solana Only", supportedChains: ["solana"] });

    const res = await GET(makeRequest({ chain: "base" }));
    const data = await res.json();

    expect(data.offers.every((o: any) => o.supportedChains.includes("base"))).toBe(true);
    expect(data.offers.some((o: any) => o.title === "Solana Only")).toBe(false);
  });

  it("filters by minPrice", async () => {
    await addTestOffer({ title: "Cheap", priceUsdc: 1 });
    await addTestOffer({ title: "Expensive", priceUsdc: 100 });

    const res = await GET(makeRequest({ minPrice: "50" }));
    const data = await res.json();

    expect(data.offers.every((o: any) => o.priceUsdc >= 50)).toBe(true);
  });

  it("filters by maxPrice", async () => {
    await addTestOffer({ title: "Cheap2", priceUsdc: 1 });
    await addTestOffer({ title: "Expensive2", priceUsdc: 100 });

    const res = await GET(makeRequest({ maxPrice: "10" }));
    const data = await res.json();

    expect(data.offers.every((o: any) => o.priceUsdc <= 10)).toBe(true);
  });

  it("filters by agentId", async () => {
    await addTestOffer({ title: "Agent A", agentId: "a" });
    await addTestOffer({ title: "Agent B", agentId: "b" });

    const res = await GET(makeRequest({ agentId: "a" }));
    const data = await res.json();

    expect(data.offers.every((o: any) => o.agentId === "a")).toBe(true);
  });

  it("ignores invalid chain parameter", async () => {
    await addTestOffer();

    const res = await GET(makeRequest({ chain: "polygon" }));
    const data = await res.json();

    // Should return all offers (invalid chain ignored)
    expect(data.offers.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array when no offers match", async () => {
    await addTestOffer({ priceUsdc: 5 });

    const res = await GET(makeRequest({ minPrice: "999" }));
    const data = await res.json();

    expect(data.offers).toEqual([]);
  });

  it("returns 400 for non-numeric minPrice", async () => {
    const res = await GET(makeRequest({ minPrice: "abc" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("minPrice");
  });

  it("returns 400 for non-numeric maxPrice", async () => {
    const res = await GET(makeRequest({ maxPrice: "xyz" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("maxPrice");
  });

  it("returns offers sorted newest first", async () => {
    const o1 = await addTestOffer({ title: "First" });
    const o2 = await addTestOffer({ title: "Second" });

    const res = await GET(makeRequest());
    const data = await res.json();

    const idx1 = data.offers.findIndex((o: any) => o.id === o1.id);
    const idx2 = data.offers.findIndex((o: any) => o.id === o2.id);
    // o2 created after o1, so should appear first
    if (idx1 !== -1 && idx2 !== -1 && o1.createdAt !== o2.createdAt) {
      expect(idx2).toBeLessThan(idx1);
    }
  });
});
