import { describe, it, expect, beforeEach } from "vitest";
import type { Offer, ChainType } from "@/types/offer";
import type { ActivityEvent } from "@/types/activity";
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
import {
  formatActivityEvent,
  getEventIcon,
} from "@/services/activity/formatter";

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1",
    agentId: "agent-1",
    title: "Test",
    description: "desc",
    priceUsdc: 0,
    contentHash: "h1",
    supportedChains: ["base"] as ChainType[],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("Activity Aggregator — Edge Cases", () => {
  beforeEach(() => clearBuffer());

  describe("Buffer Boundary Conditions", () => {
    it("handles exactly MAX_BUFFER_SIZE events without trim", () => {
      for (let i = 0; i < 500; i++) {
        pushEvent(offerPublishedEvent(makeOffer({ id: `o-${i}` })));
      }
      expect(getBufferedEvents()).toHaveLength(500);
    });

    it("preserves most recent events after trim", () => {
      for (let i = 0; i < 800; i++) {
        pushEvent(
          offerPublishedEvent(
            makeOffer({ id: `o-${i}`, createdAt: i }),
          ),
        );
      }
      const events = getBufferedEvents();
      // After trim, latest events should be preserved
      const lastEvent = events[events.length - 1]!;
      expect(lastEvent.timestamp).toBe(799);
    });

    it("handles rapid push/clear cycles", () => {
      for (let i = 0; i < 10; i++) {
        pushEvent(offerPublishedEvent(makeOffer({ id: `o-${i}` })));
        clearBuffer();
      }
      expect(getBufferedEvents()).toHaveLength(0);
    });
  });

  describe("Event Factory — Boundary Inputs", () => {
    it("offerPublishedEvent with zero-length title", () => {
      const event = offerPublishedEvent(makeOffer({ title: "" }));
      expect(event.metadata.title).toBe("");
      expect(event.type).toBe("offer_published");
    });

    it("offerPublishedEvent with no topics", () => {
      const event = offerPublishedEvent(makeOffer({ topics: undefined }));
      expect(event.metadata.topics).toBeUndefined();
    });

    it("offerPublishedEvent with no supported chains", () => {
      const event = offerPublishedEvent(
        makeOffer({ supportedChains: [] as ChainType[] }),
      );
      expect(event.chain).toBeUndefined();
    });

    it("offerPurchasedEvent with empty payer", () => {
      const event = offerPurchasedEvent(makeOffer(), "", "tx1", "base", 0);
      expect(event.actorId).toBe("");
      expect(event.metadata.amount).toBe(0);
    });

    it("bridgeSyncEvent with all zeros", () => {
      const event = bridgeSyncEvent({ created: 0, updated: 0, skipped: 0, removed: 0 });
      expect(event.metadata.created).toBe(0);
    });

    it("contentViewedEvent preserves offer ID", () => {
      const offer = makeOffer({ id: "unique-id-123" });
      const event = contentViewedEvent(offer, "viewer-1");
      expect(event.offerId).toBe("unique-id-123");
    });
  });

  describe("aggregateEvents — Pagination Edge Cases", () => {
    it("cursor equal to oldest event timestamp returns empty", () => {
      const offer = makeOffer({ createdAt: 1000 });
      const { events } = aggregateEvents([offer], 1000);
      expect(events).toHaveLength(0);
    });

    it("very large cursor returns all events", () => {
      const offers = [
        makeOffer({ id: "a", createdAt: Date.now() }),
      ];
      const { events } = aggregateEvents(offers, Date.now() + 999999);
      expect(events).toHaveLength(1);
    });

    it("limit of 1 returns exactly one event", () => {
      const offers = [
        makeOffer({ id: "a", createdAt: 1000 }),
        makeOffer({ id: "b", createdAt: 2000 }),
      ];
      const { events, hasMore } = aggregateEvents(offers, undefined, 1);
      expect(events).toHaveLength(1);
      expect(hasMore).toBe(true);
    });

    it("handles duplicate timestamps correctly", () => {
      const now = Date.now();
      const offers = [
        makeOffer({ id: "a", createdAt: now }),
        makeOffer({ id: "b", createdAt: now }),
      ];
      const { events } = aggregateEvents(offers);
      expect(events).toHaveLength(2);
    });

    it("interleaves buffered and offer events by timestamp", () => {
      const now = Date.now();
      const offers = [makeOffer({ id: "o1", createdAt: now - 5000 })];
      // Push a more recent buffered event
      pushEvent({
        id: "buf-1",
        type: "bridge_sync",
        timestamp: now,
        actorId: "bridge",
        summary: "",
        metadata: {},
      });

      const { events } = aggregateEvents(offers);
      expect(events[0]!.type).toBe("bridge_sync"); // most recent first
      expect(events[1]!.type).toBe("offer_published");
    });
  });
});

describe("Activity Formatter — Edge Cases", () => {
  it("formats offer_published with missing title as Untitled", () => {
    const result = formatActivityEvent({
      id: "1",
      type: "offer_published",
      timestamp: Date.now(),
      actorId: "a",
      summary: "",
      metadata: {},
    });
    expect(result).toContain("Untitled");
  });

  it("formats offer_purchased without chain info", () => {
    const result = formatActivityEvent({
      id: "1",
      type: "offer_purchased",
      timestamp: Date.now(),
      actorId: "buyer",
      summary: "",
      metadata: { title: "X", amount: 5 },
    });
    expect(result).toContain("buyer");
    expect(result).toContain("X");
    expect(result).not.toContain("on Base"); // no chain
  });

  it("formats bridge_sync with only created count", () => {
    const result = formatActivityEvent({
      id: "1",
      type: "bridge_sync",
      timestamp: Date.now(),
      actorId: "bridge",
      summary: "",
      metadata: { created: 5, updated: 0, removed: 0 },
    });
    expect(result).toContain("5 new");
    expect(result).not.toContain("updated");
    expect(result).not.toContain("removed");
  });

  it("formats policy_applied with defaults", () => {
    const result = formatActivityEvent({
      id: "1",
      type: "policy_applied",
      timestamp: Date.now(),
      actorId: "system",
      summary: "",
      metadata: {},
    });
    expect(result).toContain("a policy");
    expect(result).toContain("applied");
  });

  it("getEventIcon returns correct icons for all types", () => {
    expect(getEventIcon("offer_published")).toBe("publish");
    expect(getEventIcon("offer_purchased")).toBe("purchase");
    expect(getEventIcon("bridge_sync")).toBe("sync");
    expect(getEventIcon("content_viewed")).toBe("view");
    expect(getEventIcon("policy_applied")).toBe("policy");
  });
});
