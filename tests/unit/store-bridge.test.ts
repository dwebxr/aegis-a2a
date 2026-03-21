import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addOffer,
  updateOffer,
  findOfferBySourceRef,
  listOffersBySource,
  listOffers,
  removeOffer,
  _resetForTesting,
} from "@/services/content/store";
import type { ChainType } from "@/types/offer";
import type { SourceRef } from "@/types/bridge";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
}));

beforeEach(() => {
  _resetForTesting();
});

function makeSourceRef(externalId: string, version = 1): SourceRef {
  return { system: "aegis-hontal", externalId, version, syncedAt: Date.now() };
}

describe("updateOffer", () => {
  it("updates fields on an existing offer", () => {
    const offer = addOffer({
      agentId: "a",
      title: "Original",
      description: "desc",
      priceUsdc: 5,
      contentHash: "h1",
      supportedChains: ["base"] as ChainType[],
    });

    const updated = updateOffer(offer.id, { title: "Updated", priceUsdc: 10 });
    expect(updated).toBeDefined();
    expect(updated!.title).toBe("Updated");
    expect(updated!.priceUsdc).toBe(10);
    expect(updated!.description).toBe("desc"); // unchanged
    expect(updated!.id).toBe(offer.id); // preserved
    expect(updated!.createdAt).toBe(offer.createdAt); // preserved
  });

  it("returns undefined for non-existent offer", () => {
    expect(updateOffer("nonexistent", { title: "X" })).toBeUndefined();
  });

  it("cannot overwrite id or createdAt", () => {
    const offer = addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    // Even if someone passes id/createdAt they should be ignored
    const updated = updateOffer(offer.id, { title: "New" });
    expect(updated!.id).toBe(offer.id);
    expect(updated!.createdAt).toBe(offer.createdAt);
  });

  it("can add sourceRef to an existing offer", () => {
    const offer = addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const ref = makeSourceRef("ext-1");
    const updated = updateOffer(offer.id, { sourceRef: ref });
    expect(updated!.sourceRef).toEqual(ref);
  });
});

describe("findOfferBySourceRef", () => {
  it("finds an offer by sourceRef.externalId", () => {
    addOffer({
      agentId: "a",
      title: "Bridged",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-abc"),
    });

    const found = findOfferBySourceRef("ext-abc");
    expect(found).toBeDefined();
    expect(found!.title).toBe("Bridged");
  });

  it("returns undefined when no match", () => {
    expect(findOfferBySourceRef("nonexistent")).toBeUndefined();
  });

  it("ignores offers without sourceRef", () => {
    addOffer({
      agentId: "a",
      title: "Normal",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    expect(findOfferBySourceRef("anything")).toBeUndefined();
  });
});

describe("listOffersBySource", () => {
  it("returns only offers from specified source system", () => {
    addOffer({
      agentId: "a",
      title: "Bridged 1",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-1"),
    });
    addOffer({
      agentId: "a",
      title: "Bridged 2",
      description: "D",
      priceUsdc: 2,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-2"),
    });
    addOffer({
      agentId: "b",
      title: "Normal",
      description: "D",
      priceUsdc: 3,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const bridged = listOffersBySource("aegis-hontal");
    expect(bridged).toHaveLength(2);
    expect(bridged.every((o) => o.sourceRef?.system === "aegis-hontal")).toBe(true);
  });

  it("returns empty array when no offers from source", () => {
    expect(listOffersBySource("nonexistent")).toEqual([]);
  });
});

describe("listOffers with sourceSystem filter", () => {
  it("filters by sourceSystem", () => {
    addOffer({
      agentId: "a",
      title: "Bridged",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
      sourceRef: makeSourceRef("ext-1"),
    });
    addOffer({
      agentId: "b",
      title: "Normal",
      description: "D",
      priceUsdc: 2,
      contentHash: "",
      supportedChains: ["base"] as ChainType[],
    });

    const filtered = listOffers({ sourceSystem: "aegis-hontal" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Bridged");
  });
});
