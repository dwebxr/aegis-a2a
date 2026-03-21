/**
 * Tests that the store actually persists to disk and survives a "restart"
 * (simulated by resetting the in-memory state and reloading).
 * Uses REAL filesystem - no fs mocks.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";

// Set a test-specific data directory BEFORE importing store
const TEST_DATA_DIR = path.join(process.cwd(), ".aegis-test-data");
process.env.AEGIS_DATA_DIR = TEST_DATA_DIR;

// Now import store - it will use our test dir
const {
  addOffer,
  getOffer,
  listOffers,
  isPurchased,
  recordPurchase,
  _resetForTesting,
} = await import("@/services/content/store");

function cleanup() {
  _resetForTesting();
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

beforeEach(cleanup);
afterAll(cleanup);

describe("Store filesystem persistence", () => {
  it("creates data directory on first write", () => {
    expect(fs.existsSync(TEST_DATA_DIR)).toBe(false);

    addOffer({
      agentId: "test",
      title: "Test",
      description: "d",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
      encryptedContent: "secret",
    });

    expect(fs.existsSync(TEST_DATA_DIR)).toBe(true);
    expect(fs.existsSync(path.join(TEST_DATA_DIR, "offers.json"))).toBe(true);
  });

  it("persists offers to disk as valid JSON", () => {
    const offer = addOffer({
      agentId: "agent-1",
      title: "Persisted Offer",
      description: "should survive restart",
      priceUsdc: 5,
      contentHash: "hash",
      supportedChains: ["base", "solana"],
      encryptedContent: "secret-data",
    });

    const raw = fs.readFileSync(path.join(TEST_DATA_DIR, "offers.json"), "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(offer.id);
    expect(parsed[0].title).toBe("Persisted Offer");
    expect(parsed[0].encryptedContent).toBe("secret-data");
  });

  it("survives a simulated restart (reset + reload from disk)", () => {
    const offer = addOffer({
      agentId: "agent-1",
      title: "Survive Restart",
      description: "d",
      priceUsdc: 10,
      contentHash: "",
      supportedChains: ["base"],
      encryptedContent: "important",
    });
    const offerId = offer.id;

    // Simulate restart: clear in-memory state without touching disk
    _resetForTesting();

    // After reset, the store should reload from disk on next access
    const reloaded = getOffer(offerId);
    expect(reloaded).toBeDefined();
    expect(reloaded!.title).toBe("Survive Restart");
    expect(reloaded!.encryptedContent).toBe("important");
  });

  it("persists purchases across restarts", () => {
    recordPurchase("offer-1", "tx-abc");
    expect(isPurchased("offer-1", "tx-abc")).toBe(true);

    // Simulate restart
    _resetForTesting();

    // Should reload from disk
    expect(isPurchased("offer-1", "tx-abc")).toBe(true);
  });

  it("persists multiple offers correctly", () => {
    addOffer({ agentId: "a", title: "A", description: "d", priceUsdc: 1, contentHash: "", supportedChains: ["base"] });
    addOffer({ agentId: "b", title: "B", description: "d", priceUsdc: 2, contentHash: "", supportedChains: ["solana"] });
    addOffer({ agentId: "c", title: "C", description: "d", priceUsdc: 3, contentHash: "", supportedChains: ["icp"] });

    _resetForTesting();

    const offers = listOffers();
    expect(offers).toHaveLength(3);
    expect(offers.map((o) => o.title).sort()).toEqual(["A", "B", "C"]);
  });
});
