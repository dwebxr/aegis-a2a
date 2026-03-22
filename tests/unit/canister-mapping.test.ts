import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainType } from "@/types/offer";

/**
 * Tests for the toCanisterOffer / fromCanisterOffer type mapping layer
 * in store.ts. These ensure correct round-tripping between A2A Offer
 * and the canister's flat Offer type, including edge cases.
 */

// In-memory canister state
let canisterOffers: any[] = [];
let canisterReceipts: Map<string, any> = new Map();

const mockActor = {
  put_offer: vi.fn().mockImplementation(async (offer: any) => {
    const idx = canisterOffers.findIndex((o: any) => o.id === offer.id);
    if (idx >= 0) canisterOffers[idx] = offer;
    else canisterOffers.push(offer);
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
  updateOffer,
  findOfferBySourceRef,
  listOffersBySource,
  recordPurchase,
  isTransactionUsed,
} = await import("@/services/content/store");

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
});

describe("toCanisterOffer / fromCanisterOffer round-trip", () => {
  it("preserves all optional metadata through JSON packing", async () => {
    const offer = await addOffer({
      agentId: "agent-meta",
      title: "Full Metadata",
      description: "A detailed description",
      priceUsdc: 10,
      contentHash: "abc123",
      supportedChains: ["base", "solana", "icp"] as ChainType[],
      encryptedContent: "encrypted-payload",
      sourceRef: { system: "aegis-hontal", externalId: "ext-1", version: 100, syncedAt: 999 },
      vclScores: {
        originality: 8,
        insight: 7,
        credibility: 9,
        composite: 8.5,
        verdict: "quality" as const,
      },
      topics: ["crypto", "defi"],
      sourceUrl: "https://example.com/article",
      sourceName: "ExampleSource",
      imageUrl: "https://example.com/image.png",
    });

    const retrieved = await getOffer(offer.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.agentId).toBe("agent-meta");
    expect(retrieved!.description).toBe("A detailed description");
    expect(retrieved!.encryptedContent).toBe("encrypted-payload");
    expect(retrieved!.supportedChains).toEqual(["base", "solana", "icp"]);
    expect(retrieved!.sourceRef).toEqual({ system: "aegis-hontal", externalId: "ext-1", version: 100, syncedAt: 999 });
    expect(retrieved!.vclScores!.composite).toBe(8.5);
    expect(retrieved!.vclScores!.verdict).toBe("quality");
    expect(retrieved!.topics).toEqual(["crypto", "defi"]);
    expect(retrieved!.sourceUrl).toBe("https://example.com/article");
    expect(retrieved!.sourceName).toBe("ExampleSource");
    expect(retrieved!.imageUrl).toBe("https://example.com/image.png");
  });

  it("handles offer with no optional fields", async () => {
    const offer = await addOffer({
      agentId: "agent-minimal",
      title: "Minimal",
      description: "No extras",
      priceUsdc: 0,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const retrieved = await getOffer(offer.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.encryptedContent).toBeUndefined();
    expect(retrieved!.sourceRef).toBeUndefined();
    expect(retrieved!.vclScores).toBeUndefined();
    expect(retrieved!.topics).toBeUndefined();
    expect(retrieved!.sourceUrl).toBeUndefined();
    expect(retrieved!.sourceName).toBeUndefined();
    expect(retrieved!.imageUrl).toBeUndefined();
  });

  it("maps agentId ↔ publisher correctly", async () => {
    const offer = await addOffer({
      agentId: "my-custom-agent-id",
      title: "Publisher Test",
      description: "Test",
      priceUsdc: 1,
      contentHash: "h",
      supportedChains: ["base"] as ChainType[],
    });

    // Check canister offer has publisher = agentId
    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(canisterOffer.publisher).toBe("my-custom-agent-id");

    // Check reverse mapping
    const retrieved = await getOffer(offer.id);
    expect(retrieved!.agentId).toBe("my-custom-agent-id");
  });

  it("converts priceUsdc to BigInt priceUSDC and back", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "Price",
      description: "d",
      priceUsdc: 42,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(canisterOffer.priceUSDC).toBe(BigInt(42_000_000));

    const retrieved = await getOffer(offer.id);
    expect(retrieved!.priceUsdc).toBe(42);
  });

  it("preserves fractional USDC prices via micro-USDC encoding", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "Fractional",
      description: "d",
      priceUsdc: 2.5,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(canisterOffer.priceUSDC).toBe(BigInt(2_500_000)); // 2.5 * 10^6

    const retrieved = await getOffer(offer.id);
    expect(retrieved!.priceUsdc).toBe(2.5); // round-trips correctly
  });

  it("converts createdAt to BigInt and back", async () => {
    const before = Date.now();
    const offer = await addOffer({
      agentId: "a",
      title: "Time",
      description: "d",
      priceUsdc: 0,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(typeof canisterOffer.createdAt).toBe("bigint");
    expect(Number(canisterOffer.createdAt)).toBeGreaterThanOrEqual(before);

    const retrieved = await getOffer(offer.id);
    expect(typeof retrieved!.createdAt).toBe("number");
    expect(retrieved!.createdAt).toBe(offer.createdAt);
  });

  it("uses first supportedChain as canister chain field", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "Chain",
      description: "d",
      priceUsdc: 0,
      contentHash: "",
      supportedChains: ["solana", "icp"] as ChainType[],
    });

    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(canisterOffer.chain).toBe("solana");
  });

  it("uses vclScores.composite as canister vclScore", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "VCL",
      description: "d",
      priceUsdc: 0,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      vclScores: {
        originality: 8, insight: 7, credibility: 9,
        composite: 7.5, verdict: "quality" as const,
      },
    });

    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(canisterOffer.vclScore).toBe(7.5);
  });

  it("defaults vclScore to 0 when no vclScores", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "No VCL",
      description: "d",
      priceUsdc: 0,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const canisterOffer = canisterOffers.find((o) => o.id === offer.id);
    expect(canisterOffer.vclScore).toBe(0);
  });
});

describe("fromCanisterOffer legacy plain-text fallback", () => {
  it("handles non-JSON description gracefully", async () => {
    // Simulate a canister offer with plain-text description (not JSON)
    canisterOffers.push({
      id: "legacy-1",
      contentHash: "hash",
      publisher: "agent-legacy",
      priceUSDC: BigInt(5),
      chain: "base",
      vclScore: 6.0,
      title: "Legacy Offer",
      description: "This is plain text, not JSON",
      createdAt: BigInt(Date.now()),
    });

    const offers = await listOffers();
    const legacy = offers.find((o) => o.id === "legacy-1");
    expect(legacy).toBeDefined();
    expect(legacy!.description).toBe("This is plain text, not JSON");
    expect(legacy!.agentId).toBe("agent-legacy");
    expect(legacy!.supportedChains).toEqual(["base"]);
    expect(legacy!.encryptedContent).toBeUndefined();
  });

  it("handles corrupted JSON in description", async () => {
    canisterOffers.push({
      id: "corrupt-1",
      contentHash: "hash",
      publisher: "agent",
      priceUSDC: BigInt(0),
      chain: "solana",
      vclScore: 0,
      title: "Corrupt",
      description: "{invalid json: true,",
      createdAt: BigInt(Date.now()),
    });

    const offers = await listOffers();
    const corrupt = offers.find((o) => o.id === "corrupt-1");
    expect(corrupt).toBeDefined();
    expect(corrupt!.description).toBe("{invalid json: true,");
    expect(corrupt!.supportedChains).toEqual(["solana"]);
  });

  it("falls back to co.chain when meta.supportedChains is empty", async () => {
    canisterOffers.push({
      id: "empty-chains",
      contentHash: "hash",
      publisher: "agent",
      priceUSDC: BigInt(0),
      chain: "icp",
      vclScore: 0,
      title: "Empty Chains",
      description: JSON.stringify({ description: "test", supportedChains: [] }),
      createdAt: BigInt(Date.now()),
    });

    const offers = await listOffers();
    const offer = offers.find((o) => o.id === "empty-chains");
    expect(offer!.supportedChains).toEqual(["icp"]);
  });
});

describe("canister error handling", () => {
  it("propagates put_offer errors from addOffer", async () => {
    mockActor.put_offer.mockRejectedValueOnce(new Error("Canister trapped"));

    await expect(
      addOffer({
        agentId: "a", title: "t", description: "d",
        priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
      }),
    ).rejects.toThrow("Canister trapped");
  });

  it("propagates get_offers errors from listOffers", async () => {
    mockActor.get_offers.mockRejectedValueOnce(new Error("Network error"));

    await expect(listOffers()).rejects.toThrow("Network error");
  });

  it("propagates get_offers errors from getOffer", async () => {
    mockActor.get_offers.mockRejectedValueOnce(new Error("Timeout"));

    await expect(getOffer("any-id")).rejects.toThrow("Timeout");
  });

  it("propagates put_offer errors from updateOffer", async () => {
    const offer = await addOffer({
      agentId: "a", title: "t", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
    });

    mockActor.put_offer.mockRejectedValueOnce(new Error("Write failed"));

    await expect(
      updateOffer(offer.id, { title: "updated" }),
    ).rejects.toThrow("Write failed");
  });

  it("propagates submit_receipt errors from recordPurchase", async () => {
    mockActor.submit_receipt.mockRejectedValueOnce(new Error("Receipt rejected"));

    await expect(
      recordPurchase("offer-1", "tx-1", "base", "payer", 5, "hash"),
    ).rejects.toThrow("Receipt rejected");
  });

  it("propagates get_receipt errors from isTransactionUsed", async () => {
    mockActor.get_receipt.mockRejectedValueOnce(new Error("Query failed"));

    await expect(isTransactionUsed("tx-1")).rejects.toThrow("Query failed");
  });
});

describe("recordPurchase receipt structure", () => {
  it("submits receipt with verified: true and micro-USDC amount", async () => {
    await recordPurchase("offer-1", "tx-1", "base", "0xPayer", 10, "hash123");

    expect(mockActor.submit_receipt).toHaveBeenCalledWith({
      txHash: "tx-1",
      chain: "base",
      contentHash: "hash123",
      payer: "0xPayer",
      amount: BigInt(10_000_000), // 10 USDC in micro-USDC
      verified: true,
    });
  });

  it("preserves fractional USDC in receipt amount", async () => {
    await recordPurchase("offer-1", "tx-1", "base", "payer", 5.5, "hash");

    const call = mockActor.submit_receipt.mock.calls[0][0];
    expect(call.amount).toBe(BigInt(5_500_000)); // 5.5 * 10^6
  });

  it("handles zero amount", async () => {
    await recordPurchase("offer-1", "tx-1", "base", "payer", 0, "hash");

    const call = mockActor.submit_receipt.mock.calls[0][0];
    expect(call.amount).toBe(BigInt(0));
  });
});

describe("updateOffer edge cases", () => {
  it("returns undefined for non-existent offer", async () => {
    const result = await updateOffer("non-existent", { title: "new" });
    expect(result).toBeUndefined();
  });

  it("preserves id and createdAt even if passed in updates", async () => {
    const offer = await addOffer({
      agentId: "a", title: "Original", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
    });

    const updated = await updateOffer(offer.id, {
      title: "Updated",
    } as any);

    expect(updated!.id).toBe(offer.id);
    expect(updated!.createdAt).toBe(offer.createdAt);
    expect(updated!.title).toBe("Updated");
  });

  it("can update sourceRef on an existing offer", async () => {
    const offer = await addOffer({
      agentId: "a", title: "t", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
    });

    const updated = await updateOffer(offer.id, {
      sourceRef: { system: "aegis-hontal", externalId: "ext-1", version: 1, syncedAt: Date.now() },
    });

    expect(updated!.sourceRef!.system).toBe("aegis-hontal");

    // Verify it persists through round-trip
    const retrieved = await getOffer(offer.id);
    expect(retrieved!.sourceRef!.externalId).toBe("ext-1");
  });
});

describe("findOfferBySourceRef", () => {
  it("finds offer by externalId", async () => {
    await addOffer({
      agentId: "a", title: "With Ref", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "test", externalId: "find-me", version: 1, syncedAt: 0 },
    });

    const found = await findOfferBySourceRef("find-me");
    expect(found).toBeDefined();
    expect(found!.title).toBe("With Ref");
  });

  it("returns undefined when externalId not found", async () => {
    const found = await findOfferBySourceRef("non-existent");
    expect(found).toBeUndefined();
  });

  it("ignores offers without sourceRef", async () => {
    await addOffer({
      agentId: "a", title: "No Ref", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
    });

    const found = await findOfferBySourceRef("anything");
    expect(found).toBeUndefined();
  });
});

describe("listOffersBySource", () => {
  it("returns only offers from specified source system", async () => {
    await addOffer({
      agentId: "a", title: "From Aegis", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
      sourceRef: { system: "aegis-hontal", externalId: "e1", version: 1, syncedAt: 0 },
    });
    await addOffer({
      agentId: "a", title: "Manual", description: "d",
      priceUsdc: 0, contentHash: "", supportedChains: ["base"] as ChainType[],
    });

    const bridged = await listOffersBySource("aegis-hontal");
    expect(bridged).toHaveLength(1);
    expect(bridged[0].title).toBe("From Aegis");
  });

  it("returns empty array when no offers from source", async () => {
    const result = await listOffersBySource("unknown-source");
    expect(result).toEqual([]);
  });
});
