import { describe, it, expect, beforeEach } from "vitest";
import type { Offer, ChainType } from "@/types/offer";
import {
  pushEvent,
  getBufferedEvents,
  clearBuffer,
  offerPublishedEvent,
  offerPurchasedEvent,
  bridgeSyncEvent,
  contentViewedEvent,
  aggregateEvents,
} from "@/services/activity/aggregator";

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1",
    agentId: "agent-1",
    title: "Test Offer",
    description: "Test description",
    priceUsdc: 5,
    contentHash: "hash123",
    supportedChains: ["base"] as ChainType[],
    createdAt: Date.now() - 60_000,
    ...overrides,
  };
}

describe("Activity Aggregator", () => {
  beforeEach(() => {
    clearBuffer();
  });

  describe("Event Buffer", () => {
    it("pushes and retrieves events", () => {
      const offer = makeOffer();
      const event = offerPublishedEvent(offer);
      pushEvent(event);
      expect(getBufferedEvents()).toHaveLength(1);
      expect(getBufferedEvents()[0]!.type).toBe("offer_published");
    });

    it("limits buffer size with batch trimming", () => {
      for (let i = 0; i < 800; i++) {
        pushEvent(offerPublishedEvent(makeOffer({ id: `offer-${i}` })));
      }
      // Batch trim triggers at 1.5x (750), trims back to 500
      expect(getBufferedEvents().length).toBeLessThanOrEqual(550);
    });

    it("clearBuffer empties the buffer", () => {
      pushEvent(offerPublishedEvent(makeOffer()));
      clearBuffer();
      expect(getBufferedEvents()).toHaveLength(0);
    });
  });

  describe("Factory Functions", () => {
    it("offerPublishedEvent creates correct event", () => {
      const offer = makeOffer({ priceUsdc: 10, topics: ["crypto"] });
      const event = offerPublishedEvent(offer);

      expect(event.type).toBe("offer_published");
      expect(event.actorId).toBe("agent-1");
      expect(event.offerId).toBe("offer-1");
      expect(event.metadata.priceUsdc).toBe(10);
      expect(event.metadata.topics).toEqual(["crypto"]);
      expect(event.chain).toBe("base");
    });

    it("offerPurchasedEvent includes payment details", () => {
      const offer = makeOffer();
      const event = offerPurchasedEvent(offer, "0xBuyer", "0xTx123", "base", 5);

      expect(event.type).toBe("offer_purchased");
      expect(event.actorId).toBe("0xBuyer");
      expect(event.txHash).toBe("0xTx123");
      expect(event.chain).toBe("base");
      expect(event.metadata.amount).toBe(5);
    });

    it("bridgeSyncEvent captures sync result", () => {
      const event = bridgeSyncEvent({
        created: 3,
        updated: 1,
        skipped: 5,
        removed: 0,
      });

      expect(event.type).toBe("bridge_sync");
      expect(event.actorId).toBe("aegis-bridge");
      expect(event.metadata.created).toBe(3);
      expect(event.metadata.updated).toBe(1);
    });

    it("contentViewedEvent tracks viewer", () => {
      const offer = makeOffer();
      const event = contentViewedEvent(offer, "anonymous");

      expect(event.type).toBe("content_viewed");
      expect(event.actorId).toBe("anonymous");
      expect(event.metadata.title).toBe("Test Offer");
    });
  });

  describe("aggregateEvents", () => {
    it("merges offer-derived events with buffered events", () => {
      const offer = makeOffer({ createdAt: Date.now() - 120_000 });
      pushEvent(
        bridgeSyncEvent({ created: 1, updated: 0, skipped: 0, removed: 0 }),
      );

      const { events } = aggregateEvents([offer]);
      expect(events.length).toBe(2);
      // Most recent first (bridge sync is newer)
      expect(events[0]!.type).toBe("bridge_sync");
      expect(events[1]!.type).toBe("offer_published");
    });

    it("applies cursor-based pagination", () => {
      const now = Date.now();
      const offers = [
        makeOffer({ id: "a", createdAt: now - 1000 }),
        makeOffer({ id: "b", createdAt: now - 2000 }),
        makeOffer({ id: "c", createdAt: now - 3000 }),
      ];

      // First page: all events before cursor
      const { events, cursor, hasMore } = aggregateEvents(offers, undefined, 2);
      expect(events).toHaveLength(2);
      expect(hasMore).toBe(true);
      expect(cursor).toBeDefined();

      // Second page using cursor
      const page2 = aggregateEvents(offers, cursor!, 2);
      expect(page2.events).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it("returns empty result for no data", () => {
      const { events, hasMore } = aggregateEvents([]);
      expect(events).toHaveLength(0);
      expect(hasMore).toBe(false);
    });

    it("sorts by timestamp descending", () => {
      const now = Date.now();
      const offers = [
        makeOffer({ id: "old", createdAt: now - 10_000 }),
        makeOffer({ id: "new", createdAt: now - 1_000 }),
      ];

      const { events } = aggregateEvents(offers);
      expect(events[0]!.timestamp).toBeGreaterThan(events[1]!.timestamp);
    });
  });
});
