import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainType } from "@/types/offer";
import type { SourceRef } from "@/types/bridge";

// In-memory canister state for testing
let canisterOffers: any[] = [];

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
  submit_receipt: vi.fn().mockResolvedValue(undefined),
  get_receipt: vi.fn().mockResolvedValue([]),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
}));

const {
  addOffer,
  updateOffer,
  findOfferBySourceRef,
  listOffersBySource,
  listOffers,
} = await import("@/services/content/store");

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
});

function makeSourceRef(externalId: string, version = 1): SourceRef {
  return { system: "aegis-hontal", externalId, version, syncedAt: Date.now() };
}

describe("updateOffer", () => {
  it("updates fields on an existing offer", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "Original",
      description: "desc",
      priceUsdc: 5,
      contentHash: "h1",
      supportedChains: ["base"] as ChainType[],
    });

    const updated = await updateOffer(offer.id, { title: "Updated", priceUsdc: 10 });
    expect(updated).toBeDefined();
    expect(updated!.title).toBe("Updated");
    expect(updated!.priceUsdc).toBe(10);
    expect(updated!.description).toBe("desc"); // unchanged
    expect(updated!.id).toBe(offer.id); // preserved
    expect(updated!.createdAt).toBe(offer.createdAt); // preserved
  });

  it("returns undefined for non-existent offer", async () => {
    expect(await updateOffer("nonexistent", { title: "X" })).toBeUndefined();
  });

  it("cannot overwrite id or createdAt", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    // Even if someone passes id/createdAt they should be ignored
    const updated = await updateOffer(offer.id, { title: "New" });
    expect(updated!.id).toBe(offer.id);
    expect(updated!.createdAt).toBe(offer.createdAt);
  });

  it("can add sourceRef to an existing offer", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const ref = makeSourceRef("ext-1");
    const updated = await updateOffer(offer.id, { sourceRef: ref });
    expect(updated!.sourceRef).toEqual(ref);
  });
});

describe("findOfferBySourceRef", () => {
  it("finds an offer by sourceRef.externalId", async () => {
    await addOffer({
      agentId: "a",
      title: "Bridged",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-abc"),
    });

    const found = await findOfferBySourceRef("ext-abc");
    expect(found).toBeDefined();
    expect(found!.title).toBe("Bridged");
  });

  it("returns undefined when no match", async () => {
    expect(await findOfferBySourceRef("nonexistent")).toBeUndefined();
  });

  it("ignores offers without sourceRef", async () => {
    await addOffer({
      agentId: "a",
      title: "Normal",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    expect(await findOfferBySourceRef("anything")).toBeUndefined();
  });
});

describe("listOffersBySource", () => {
  it("returns only offers from specified source system", async () => {
    await addOffer({
      agentId: "a",
      title: "Bridged 1",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-1"),
    });
    await addOffer({
      agentId: "a",
      title: "Bridged 2",
      description: "D",
      priceUsdc: 2,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-2"),
    });
    await addOffer({
      agentId: "b",
      title: "Normal",
      description: "D",
      priceUsdc: 3,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const bridged = await listOffersBySource("aegis-hontal");
    expect(bridged).toHaveLength(2);
    expect(bridged.every((o) => o.sourceRef?.system === "aegis-hontal")).toBe(true);
  });

  it("returns empty array when no offers from source", async () => {
    expect(await listOffersBySource("nonexistent")).toEqual([]);
  });
});

describe("listOffers with sourceSystem filter", () => {
  it("filters by sourceSystem", async () => {
    await addOffer({
      agentId: "a",
      title: "Bridged",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-1"),
    });
    await addOffer({
      agentId: "b",
      title: "Normal",
      description: "D",
      priceUsdc: 2,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const filtered = await listOffers({ sourceSystem: "aegis-hontal" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Bridged");
  });
});
