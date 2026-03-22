import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainType } from "@/types/offer";

// In-memory canister state for testing
let canisterOffers: any[] = [];
let canisterReceipts: Map<string, any> = new Map();

const mockActor = {
  put_offer: vi.fn().mockImplementation(async (offer: any) => {
    const idx = canisterOffers.findIndex((o) => o.id === offer.id);
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
  submit_receipt: vi.fn().mockImplementation(async (receipt: any) => {
    canisterReceipts.set(receipt.txHash, receipt);
  }),
  get_receipt: vi.fn().mockImplementation(async (txHash: string) => {
    const r = canisterReceipts.get(txHash);
    return r ? [r] : [];
  }),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
}));

const {
  addOffer,
  getOffer,
  listOffers,
  recordPurchase,
  isTransactionUsed,
} = await import("@/services/content/store");

let createdIds: string[] = [];

async function createTestOffer(overrides: Partial<Parameters<typeof addOffer>[0]> = {}) {
  const offer = await addOffer({
    agentId: "agent-1",
    title: "Test Offer",
    description: "Test description",
    priceUsdc: 5,
    contentHash: "hash123",
    supportedChains: ["base", "solana"] as ChainType[],
    encryptedContent: "secret-content",
    ...overrides,
  });
  createdIds.push(offer.id);
  return offer;
}

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  createdIds = [];
});

describe("addOffer", () => {
  it("creates an offer with generated id and timestamp", async () => {
    const before = Date.now();
    const offer = await createTestOffer();
    const after = Date.now();

    expect(offer.id).toBeDefined();
    expect(offer.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(offer.createdAt).toBeGreaterThanOrEqual(before);
    expect(offer.createdAt).toBeLessThanOrEqual(after);
    expect(offer.title).toBe("Test Offer");
    expect(offer.priceUsdc).toBe(5);
  });

  it("stores the encrypted content", async () => {
    const offer = await createTestOffer({ encryptedContent: "my-secret" });
    expect(offer.encryptedContent).toBe("my-secret");
  });

  it("preserves all fields from input", async () => {
    const offer = await createTestOffer({
      agentId: "custom-agent",
      title: "Custom Title",
      description: "Custom desc",
      priceUsdc: 12.50,
      contentHash: "abc",
      supportedChains: ["icp"],
    });
    expect(offer.agentId).toBe("custom-agent");
    expect(offer.title).toBe("Custom Title");
    expect(offer.description).toBe("Custom desc");
    expect(offer.priceUsdc).toBe(12.50);
    expect(offer.contentHash).toBe("abc");
    expect(offer.supportedChains).toEqual(["icp"]);
  });

  it("generates unique IDs for each offer", async () => {
    const offer1 = await createTestOffer();
    const offer2 = await createTestOffer();
    expect(offer1.id).not.toBe(offer2.id);
  });

  it("handles zero price for free offers", async () => {
    const offer = await createTestOffer({ priceUsdc: 0 });
    expect(offer.priceUsdc).toBe(0);
  });
});

describe("getOffer", () => {
  it("retrieves an existing offer by ID", async () => {
    const created = await createTestOffer();
    const retrieved = await getOffer(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.title).toBe(created.title);
  });

  it("returns undefined for non-existent ID", async () => {
    expect(await getOffer("non-existent-id")).toBeUndefined();
  });

  it("returns undefined for empty string", async () => {
    expect(await getOffer("")).toBeUndefined();
  });
});

describe("listOffers", () => {
  it("returns all offers when no filter is provided", async () => {
    const o1 = await createTestOffer({ title: "First" });
    const o2 = await createTestOffer({ title: "Second" });

    const offers = await listOffers();
    const ids = offers.map((o) => o.id);
    expect(ids).toContain(o1.id);
    expect(ids).toContain(o2.id);
  });

  it("returns offers sorted by createdAt descending (newest first)", async () => {
    const o1 = await createTestOffer({ title: "First" });
    const o2 = await addOffer({
      agentId: "a",
      title: "Second",
      description: "d",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
    });
    createdIds.push(o2.id);

    const offers = await listOffers();
    const o1Idx = offers.findIndex((o) => o.id === o1.id);
    const o2Idx = offers.findIndex((o) => o.id === o2.id);

    // o2 was created after o1, so o2 should appear first
    if (o1.createdAt !== o2.createdAt) {
      expect(o2Idx).toBeLessThan(o1Idx);
    }
  });

  it("filters by chain", async () => {
    await createTestOffer({ supportedChains: ["base"], title: "Base Only" });
    await createTestOffer({ supportedChains: ["solana"], title: "Solana Only" });
    await createTestOffer({ supportedChains: ["base", "solana"], title: "Both" });

    const baseOffers = await listOffers({ chain: "base" });
    expect(baseOffers.every((o) => o.supportedChains.includes("base"))).toBe(true);
    expect(baseOffers.length).toBeGreaterThanOrEqual(2); // "Base Only" + "Both"

    const solanaOffers = await listOffers({ chain: "solana" });
    expect(solanaOffers.every((o) => o.supportedChains.includes("solana"))).toBe(true);

    const icpOffers = await listOffers({ chain: "icp" });
    expect(icpOffers.every((o) => o.supportedChains.includes("icp"))).toBe(true);
  });

  it("filters by minPrice", async () => {
    await createTestOffer({ priceUsdc: 1, title: "Cheap" });
    await createTestOffer({ priceUsdc: 10, title: "Medium" });
    await createTestOffer({ priceUsdc: 100, title: "Expensive" });

    const filtered = await listOffers({ minPrice: 10 });
    expect(filtered.every((o) => o.priceUsdc >= 10)).toBe(true);
    expect(filtered.some((o) => o.priceUsdc === 1)).toBe(false);
  });

  it("filters by maxPrice", async () => {
    await createTestOffer({ priceUsdc: 1, title: "Cheap2" });
    await createTestOffer({ priceUsdc: 10, title: "Medium2" });
    await createTestOffer({ priceUsdc: 100, title: "Expensive2" });

    const filtered = await listOffers({ maxPrice: 10 });
    expect(filtered.every((o) => o.priceUsdc <= 10)).toBe(true);
    expect(filtered.some((o) => o.priceUsdc === 100)).toBe(false);
  });

  it("filters by agentId", async () => {
    await createTestOffer({ agentId: "agent-A", title: "From A" });
    await createTestOffer({ agentId: "agent-B", title: "From B" });

    const filtered = await listOffers({ agentId: "agent-A" });
    expect(filtered.every((o) => o.agentId === "agent-A")).toBe(true);
  });

  it("combines multiple filters", async () => {
    await createTestOffer({ agentId: "x", priceUsdc: 5, supportedChains: ["base"], title: "match" });
    await createTestOffer({ agentId: "x", priceUsdc: 50, supportedChains: ["base"], title: "too expensive" });
    await createTestOffer({ agentId: "y", priceUsdc: 5, supportedChains: ["base"], title: "wrong agent" });

    const filtered = await listOffers({ agentId: "x", maxPrice: 10, chain: "base" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("match");
  });

  it("returns empty array when no offers match filter", async () => {
    await createTestOffer({ priceUsdc: 5 });
    const filtered = await listOffers({ minPrice: 999 });
    expect(filtered).toEqual([]);
  });

  it("handles filter with minPrice=0 correctly", async () => {
    await createTestOffer({ priceUsdc: 0, title: "Free" });
    await createTestOffer({ priceUsdc: 5, title: "Paid" });

    const filtered = await listOffers({ minPrice: 0 });
    expect(filtered.length).toBeGreaterThanOrEqual(2);
  });
});

describe("purchases (recordPurchase / isTransactionUsed)", () => {
  it("records a purchase and isTransactionUsed returns true", async () => {
    await recordPurchase("offer-1", "tx-abc", "base", "0xpayer", 5, "hash123");
    expect(await isTransactionUsed("tx-abc")).toBe(true);
  });

  it("returns false for unrecorded txHash", async () => {
    expect(await isTransactionUsed("tx-unknown")).toBe(false);
  });

  it("same txHash is detected regardless of which offer used it", async () => {
    await recordPurchase("offer-A", "tx-shared", "base", "0xpayer", 5, "hash");
    // txHash-based lookup — cross-offer replay protection
    expect(await isTransactionUsed("tx-shared")).toBe(true);
  });

  it("differentiates different txHashes", async () => {
    await recordPurchase("offer-X", "tx-1", "base", "0xpayer", 5, "hash");
    expect(await isTransactionUsed("tx-1")).toBe(true);
    expect(await isTransactionUsed("tx-2")).toBe(false);
  });

  it("handles empty string txHash", async () => {
    await recordPurchase("", "", "base", "0xpayer", 0, "");
    expect(await isTransactionUsed("")).toBe(true);
    expect(await isTransactionUsed("something")).toBe(false);
  });
});
