/**
 * Tests that the store persists to the canister via the actor.
 * The store now calls getBackendActor() which we mock with in-memory state.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory canister state for testing
let canisterOffers: any[] = [];
let canisterReceipts: Map<string, any> = new Map();

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
  isTransactionUsed,
  recordPurchase,
} = await import("@/services/content/store");

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
});

describe("Store canister persistence", () => {
  it("calls put_offer on addOffer", async () => {
    await addOffer({
      agentId: "test",
      title: "Test",
      description: "d",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
      encryptedContent: "secret",
    });

    expect(mockActor.put_offer).toHaveBeenCalledTimes(1);
  });

  it("persists offers via canister actor", async () => {
    const offer = await addOffer({
      agentId: "agent-1",
      title: "Persisted Offer",
      description: "should survive via canister",
      priceUsdc: 5,
      contentHash: "hash",
      supportedChains: ["base", "solana"],
      encryptedContent: "secret-data",
    });

    // Verify offer is retrievable (through get_offers mock)
    const retrieved = await getOffer(offer.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe("Persisted Offer");
  });

  it("data persists across multiple calls (canister state retained)", async () => {
    await addOffer({
      agentId: "agent-1",
      title: "Survive Restart",
      description: "d",
      priceUsdc: 10,
      contentHash: "",
      supportedChains: ["base"],
      encryptedContent: "important",
    });

    // The canister state is retained in canisterOffers array
    const offers = await listOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0].title).toBe("Survive Restart");
  });

  it("persists purchases via canister receipts", async () => {
    await recordPurchase("offer-1", "tx-abc", "base", "0xpayer", 5, "hash123");
    expect(await isTransactionUsed("tx-abc")).toBe(true);
  });

  it("persists multiple offers correctly", async () => {
    await addOffer({ agentId: "a", title: "A", description: "d", priceUsdc: 1, contentHash: "", supportedChains: ["base"] });
    await addOffer({ agentId: "b", title: "B", description: "d", priceUsdc: 2, contentHash: "", supportedChains: ["solana"] });
    await addOffer({ agentId: "c", title: "C", description: "d", priceUsdc: 3, contentHash: "", supportedChains: ["icp"] });

    const offers = await listOffers();
    expect(offers).toHaveLength(3);
    expect(offers.map((o) => o.title).sort()).toEqual(["A", "B", "C"]);
  });
});
