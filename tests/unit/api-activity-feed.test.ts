import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChainType } from "@/types/offer";

// Mock only the canister actor, everything else runs real code
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
  get_offers: vi.fn().mockImplementation(async () => [...canisterOffers]),
  delete_offer: vi.fn().mockImplementation(async (id: string) => {
    const idx = canisterOffers.findIndex((o: any) => o.id === id);
    if (idx >= 0) { canisterOffers.splice(idx, 1); return true; }
    return false;
  }),
  submit_receipt: vi.fn(),
  get_receipt: vi.fn().mockResolvedValue([]),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
}));

const { addOffer } = await import("@/services/content/store");
const { aggregateEvents, clearBuffer, pushEvent, bridgeSyncEvent } = await import("@/services/activity/aggregator");
const { formatActivityEvent } = await import("@/services/activity/formatter");

beforeEach(() => {
  canisterOffers = [];
  clearBuffer();
});

describe("Activity Feed — Integration (real store → aggregator → formatter)", () => {
  it("published offers appear as events in the feed", async () => {
    await addOffer({
      agentId: "hermes",
      title: "Alpha Signal",
      description: "Market insights",
      priceUsdc: 10,
      contentHash: "hash1",
      supportedChains: ["base", "solana"] as ChainType[],
      encryptedContent: "secret",
      vclScores: { originality: 8, insight: 7, credibility: 9, composite: 8, verdict: "quality" as const },
      topics: ["crypto"],
    });

    await addOffer({
      agentId: "milady",
      title: "Free Report",
      description: "Open content",
      priceUsdc: 0,
      contentHash: "hash2",
      supportedChains: ["icp"] as ChainType[],
    });

    const { listOffers } = await import("@/services/content/store");
    const offers = await listOffers();
    const { events } = aggregateEvents(offers);

    expect(events).toHaveLength(2);
    // Newest first
    expect(events[0]!.type).toBe("offer_published");
    expect(events[1]!.type).toBe("offer_published");

    // Verify formatted summaries contain real data
    const summary0 = formatActivityEvent(events[0]!);
    const summary1 = formatActivityEvent(events[1]!);

    // One of them should contain "hermes" and the other "milady"
    const summaries = [summary0, summary1].join(" ");
    expect(summaries).toContain("hermes");
    expect(summaries).toContain("milady");
  });

  it("bridge sync events interleave with offers", async () => {
    // Insert offer directly with a known old timestamp
    canisterOffers.push({
      id: "old-offer",
      publisher: "agent-1",
      title: "Old Offer",
      description: JSON.stringify({ description: "desc" }),
      priceUSDC: BigInt(0),
      chain: "base",
      vclScore: 0,
      contentHash: "h1",
      createdAt: BigInt(1000), // very old
    });

    // Push a bridge sync event (clearly more recent)
    pushEvent(bridgeSyncEvent({ created: 5, updated: 2, skipped: 10, removed: 1 }));

    const { listOffers } = await import("@/services/content/store");
    const offers = await listOffers();
    const { events } = aggregateEvents(offers);

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("bridge_sync");
    expect(events[1]!.type).toBe("offer_published");

    // Verify the bridge sync summary has real counts
    const syncSummary = formatActivityEvent(events[0]!);
    expect(syncSummary).toContain("5 new");
    expect(syncSummary).toContain("2 updated");
    expect(syncSummary).toContain("1 removed");
  });

  it("pagination correctly splits real data", async () => {
    // Create 5 offers with known timestamps
    for (let i = 0; i < 5; i++) {
      canisterOffers.push({
        id: `o-${i}`,
        publisher: "agent",
        title: `Offer ${i}`,
        description: JSON.stringify({ description: `Offer ${i}` }),
        priceUSDC: BigInt(0),
        chain: "base",
        vclScore: 0,
        contentHash: `h-${i}`,
        createdAt: BigInt(1000 + i * 1000),
      });
    }

    const { listOffers } = await import("@/services/content/store");
    const offers = await listOffers();
    expect(offers).toHaveLength(5);

    // Page 1: limit 2
    const page1 = aggregateEvents(offers, undefined, 2);
    expect(page1.events).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).toBeDefined();

    // Page 2: continue from cursor
    const page2 = aggregateEvents(offers, page1.cursor!, 2);
    expect(page2.events).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    // Page 3: last remaining
    const page3 = aggregateEvents(offers, page2.cursor!, 2);
    expect(page3.events).toHaveLength(1);
    expect(page3.hasMore).toBe(false);

    // All pages together should cover all 5 offers
    const allIds = new Set([
      ...page1.events.map((e) => e.offerId),
      ...page2.events.map((e) => e.offerId),
      ...page3.events.map((e) => e.offerId),
    ]);
    expect(allIds.size).toBe(5);
  });
});
