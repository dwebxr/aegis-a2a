import { describe, it, expect } from "vitest";
import type { ActivityEvent } from "@/types/activity";
import {
  formatActivityEvent,
  getEventIcon,
} from "@/services/activity/formatter";

function makeEvent(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: "evt-1",
    type: "offer_published",
    timestamp: Date.now(),
    actorId: "agent-1",
    summary: "",
    metadata: {},
    ...overrides,
  };
}

describe("Activity Formatter", () => {
  describe("formatActivityEvent", () => {
    it("formats offer_published with price", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "offer_published",
          actorId: "hermes",
          metadata: { title: "Crypto Alpha", priceUsdc: 10 },
        }),
      );
      expect(result).toContain("hermes");
      expect(result).toContain("Crypto Alpha");
      expect(result).toContain("$10 USDC");
    });

    it("formats offer_published free", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "offer_published",
          metadata: { title: "Free Report", priceUsdc: 0 },
        }),
      );
      expect(result).toContain("Free");
    });

    it("formats offer_purchased with chain", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "offer_purchased",
          actorId: "0xBuyer",
          chain: "solana",
          metadata: { title: "Alpha Signal", amount: 5 },
        }),
      );
      expect(result).toContain("0xBuyer");
      expect(result).toContain("Alpha Signal");
      expect(result).toContain("$5 USDC");
      expect(result).toContain("Solana");
    });

    it("formats bridge_sync with counts", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "bridge_sync",
          metadata: { created: 3, updated: 1, removed: 2 },
        }),
      );
      expect(result).toContain("3 new");
      expect(result).toContain("1 updated");
      expect(result).toContain("2 removed");
    });

    it("formats bridge_sync with no changes", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "bridge_sync",
          metadata: { created: 0, updated: 0, removed: 0 },
        }),
      );
      expect(result).toContain("no changes");
    });

    it("formats content_viewed", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "content_viewed",
          actorId: "reader",
          metadata: { title: "My Article" },
        }),
      );
      expect(result).toContain("reader");
      expect(result).toContain("My Article");
    });

    it("formats policy_applied", () => {
      const result = formatActivityEvent(
        makeEvent({
          type: "policy_applied",
          metadata: { policyName: "High Quality Only", action: "activated" },
        }),
      );
      expect(result).toContain("High Quality Only");
      expect(result).toContain("activated");
    });

    it("handles unknown event type gracefully", () => {
      const result = formatActivityEvent(
        makeEvent({ type: "unknown_type" as any }),
      );
      expect(result).toContain("Unknown event");
    });

    it("handles missing metadata gracefully", () => {
      const result = formatActivityEvent(
        makeEvent({ type: "offer_published", metadata: {} }),
      );
      expect(result).toContain("Untitled");
      expect(result).toContain("Free");
    });
  });

  describe("getEventIcon", () => {
    it("returns correct icon names", () => {
      expect(getEventIcon("offer_published")).toBe("publish");
      expect(getEventIcon("offer_purchased")).toBe("purchase");
      expect(getEventIcon("bridge_sync")).toBe("sync");
      expect(getEventIcon("content_viewed")).toBe("view");
      expect(getEventIcon("policy_applied")).toBe("policy");
    });

    it("returns fallback for unknown type", () => {
      expect(getEventIcon("unknown" as any)).toBe("unknown");
    });
  });
});
