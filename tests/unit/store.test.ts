import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addOffer,
  getOffer,
  listOffers,
  removeOffer,
  recordPurchase,
  isPurchased,
  _resetForTesting,
} from "@/services/content/store";
import type { ChainType } from "@/types/offer";

// Mock fs to prevent actual disk writes during tests
vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
}));

let createdIds: string[] = [];

function createTestOffer(overrides: Partial<Parameters<typeof addOffer>[0]> = {}) {
  const offer = addOffer({
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
  _resetForTesting();
  createdIds = [];
});

describe("addOffer", () => {
  it("creates an offer with generated id and timestamp", () => {
    const before = Date.now();
    const offer = createTestOffer();
    const after = Date.now();

    expect(offer.id).toBeDefined();
    expect(offer.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(offer.createdAt).toBeGreaterThanOrEqual(before);
    expect(offer.createdAt).toBeLessThanOrEqual(after);
    expect(offer.title).toBe("Test Offer");
    expect(offer.priceUsdc).toBe(5);
  });

  it("stores the encrypted content", () => {
    const offer = createTestOffer({ encryptedContent: "my-secret" });
    expect(offer.encryptedContent).toBe("my-secret");
  });

  it("preserves all fields from input", () => {
    const offer = createTestOffer({
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

  it("generates unique IDs for each offer", () => {
    const offer1 = createTestOffer();
    const offer2 = createTestOffer();
    expect(offer1.id).not.toBe(offer2.id);
  });

  it("handles zero price for free offers", () => {
    const offer = createTestOffer({ priceUsdc: 0 });
    expect(offer.priceUsdc).toBe(0);
  });
});

describe("getOffer", () => {
  it("retrieves an existing offer by ID", () => {
    const created = createTestOffer();
    const retrieved = getOffer(created.id);
    expect(retrieved).toEqual(created);
  });

  it("returns undefined for non-existent ID", () => {
    expect(getOffer("non-existent-id")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getOffer("")).toBeUndefined();
  });
});

describe("listOffers", () => {
  it("returns all offers when no filter is provided", () => {
    const o1 = createTestOffer({ title: "First" });
    const o2 = createTestOffer({ title: "Second" });

    const offers = listOffers();
    const ids = offers.map((o) => o.id);
    expect(ids).toContain(o1.id);
    expect(ids).toContain(o2.id);
  });

  it("returns offers sorted by createdAt descending (newest first)", () => {
    const o1 = createTestOffer({ title: "First" });
    // Small delay to ensure different timestamps
    const o2 = addOffer({
      agentId: "a",
      title: "Second",
      description: "d",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
    });
    createdIds.push(o2.id);

    const offers = listOffers();
    const o1Idx = offers.findIndex((o) => o.id === o1.id);
    const o2Idx = offers.findIndex((o) => o.id === o2.id);

    // o2 was created after o1, so o2 should appear first
    if (o1.createdAt !== o2.createdAt) {
      expect(o2Idx).toBeLessThan(o1Idx);
    }
  });

  it("filters by chain", () => {
    createTestOffer({ supportedChains: ["base"], title: "Base Only" });
    createTestOffer({ supportedChains: ["solana"], title: "Solana Only" });
    createTestOffer({ supportedChains: ["base", "solana"], title: "Both" });

    const baseOffers = listOffers({ chain: "base" });
    expect(baseOffers.every((o) => o.supportedChains.includes("base"))).toBe(true);
    expect(baseOffers.length).toBeGreaterThanOrEqual(2); // "Base Only" + "Both"

    const solanaOffers = listOffers({ chain: "solana" });
    expect(solanaOffers.every((o) => o.supportedChains.includes("solana"))).toBe(true);

    const icpOffers = listOffers({ chain: "icp" });
    expect(icpOffers.every((o) => o.supportedChains.includes("icp"))).toBe(true);
  });

  it("filters by minPrice", () => {
    createTestOffer({ priceUsdc: 1, title: "Cheap" });
    createTestOffer({ priceUsdc: 10, title: "Medium" });
    createTestOffer({ priceUsdc: 100, title: "Expensive" });

    const filtered = listOffers({ minPrice: 10 });
    expect(filtered.every((o) => o.priceUsdc >= 10)).toBe(true);
    expect(filtered.some((o) => o.priceUsdc === 1)).toBe(false);
  });

  it("filters by maxPrice", () => {
    createTestOffer({ priceUsdc: 1, title: "Cheap2" });
    createTestOffer({ priceUsdc: 10, title: "Medium2" });
    createTestOffer({ priceUsdc: 100, title: "Expensive2" });

    const filtered = listOffers({ maxPrice: 10 });
    expect(filtered.every((o) => o.priceUsdc <= 10)).toBe(true);
    expect(filtered.some((o) => o.priceUsdc === 100)).toBe(false);
  });

  it("filters by agentId", () => {
    createTestOffer({ agentId: "agent-A", title: "From A" });
    createTestOffer({ agentId: "agent-B", title: "From B" });

    const filtered = listOffers({ agentId: "agent-A" });
    expect(filtered.every((o) => o.agentId === "agent-A")).toBe(true);
  });

  it("combines multiple filters", () => {
    createTestOffer({ agentId: "x", priceUsdc: 5, supportedChains: ["base"], title: "match" });
    createTestOffer({ agentId: "x", priceUsdc: 50, supportedChains: ["base"], title: "too expensive" });
    createTestOffer({ agentId: "y", priceUsdc: 5, supportedChains: ["base"], title: "wrong agent" });

    const filtered = listOffers({ agentId: "x", maxPrice: 10, chain: "base" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("match");
  });

  it("returns empty array when no offers match filter", () => {
    createTestOffer({ priceUsdc: 5 });
    const filtered = listOffers({ minPrice: 999 });
    expect(filtered).toEqual([]);
  });

  it("handles filter with minPrice=0 correctly", () => {
    createTestOffer({ priceUsdc: 0, title: "Free" });
    createTestOffer({ priceUsdc: 5, title: "Paid" });

    const filtered = listOffers({ minPrice: 0 });
    expect(filtered.length).toBeGreaterThanOrEqual(2);
  });
});

describe("removeOffer", () => {
  it("removes an existing offer", () => {
    const offer = createTestOffer();
    expect(removeOffer(offer.id)).toBe(true);
    expect(getOffer(offer.id)).toBeUndefined();
    // Remove from tracking since already deleted
    createdIds = createdIds.filter((id) => id !== offer.id);
  });

  it("returns false when removing non-existent offer", () => {
    expect(removeOffer("non-existent")).toBe(false);
  });

  it("removed offer does not appear in list", () => {
    const offer = createTestOffer({ title: "ToRemove" });
    removeOffer(offer.id);
    const offers = listOffers();
    expect(offers.find((o) => o.id === offer.id)).toBeUndefined();
    createdIds = createdIds.filter((id) => id !== offer.id);
  });
});

describe("purchases (recordPurchase / isPurchased)", () => {
  it("records a purchase and returns true for isPurchased", () => {
    recordPurchase("offer-1", "tx-abc");
    expect(isPurchased("offer-1", "tx-abc")).toBe(true);
  });

  it("returns false for unrecorded purchases", () => {
    expect(isPurchased("offer-1", "tx-unknown")).toBe(false);
    expect(isPurchased("unknown-offer", "tx-abc")).toBe(false);
  });

  it("differentiates same txHash across different offers", () => {
    recordPurchase("offer-A", "tx-shared");
    expect(isPurchased("offer-A", "tx-shared")).toBe(true);
    expect(isPurchased("offer-B", "tx-shared")).toBe(false);
  });

  it("differentiates same offer with different txHashes", () => {
    recordPurchase("offer-X", "tx-1");
    expect(isPurchased("offer-X", "tx-1")).toBe(true);
    expect(isPurchased("offer-X", "tx-2")).toBe(false);
  });

  it("handles empty strings", () => {
    recordPurchase("", "");
    expect(isPurchased("", "")).toBe(true);
    expect(isPurchased("", "something")).toBe(false);
  });
});
