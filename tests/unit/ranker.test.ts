import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Offer } from "@/types/offer";

// Mock the db module
vi.mock("@/services/preference/db", () => ({
  getRecentInteractions: vi.fn().mockResolvedValue([]),
  getPreferences: vi.fn().mockResolvedValue([]),
  cacheRanking: vi.fn().mockResolvedValue(undefined),
  getCachedRanking: vi.fn().mockResolvedValue(null),
}));

// Mock the llm-engine
vi.mock("@/services/preference/llm-engine", () => ({
  generateCompletion: vi.fn().mockResolvedValue("[80, 60, 40]"),
  isReady: vi.fn().mockReturnValue(false),
}));

const db = await import("@/services/preference/db");
const llm = await import("@/services/preference/llm-engine");
const { rankOffers } = await import("@/services/preference/ranker");

function makeOffer(id: string, title: string, desc = ""): Offer {
  return {
    id,
    agentId: "agent-1",
    title,
    description: desc,
    priceUsdc: 5,
    contentHash: "",
    supportedChains: ["base"],
    createdAt: Date.now(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getCachedRanking).mockResolvedValue(null);
  vi.mocked(db.getPreferences).mockResolvedValue([]);
  vi.mocked(db.getRecentInteractions).mockResolvedValue([]);
  vi.mocked(llm.isReady).mockReturnValue(false);
});

describe("rankOffers", () => {
  it("returns empty array for empty input", async () => {
    const result = await rankOffers([]);
    expect(result).toEqual([]);
  });

  it("assigns default score of 50 when no preferences exist", async () => {
    const offers = [makeOffer("1", "Test")];
    const result = await rankOffers(offers);

    expect(result).toHaveLength(1);
    expect(result[0].resonanceScore).toBe(50);
    expect(result[0].id).toBe("1");
  });

  it("uses cached rankings when available", async () => {
    vi.mocked(db.getCachedRanking).mockResolvedValue(85);
    const offers = [makeOffer("cached-1", "Cached Offer")];
    const result = await rankOffers(offers);

    expect(result).toHaveLength(1);
    expect(result[0].resonanceScore).toBe(85);
    // Should NOT have called getPreferences since all were cached
    expect(db.getPreferences).not.toHaveBeenCalled();
  });

  it("mixes cached and uncached results", async () => {
    vi.mocked(db.getCachedRanking)
      .mockResolvedValueOnce(90) // first offer cached
      .mockResolvedValueOnce(null); // second not cached

    const offers = [
      makeOffer("c1", "Cached"),
      makeOffer("u1", "Uncached"),
    ];
    const result = await rankOffers(offers);

    expect(result).toHaveLength(2);
    // Cached offer should have score 90
    const cachedResult = result.find((o) => o.id === "c1");
    expect(cachedResult?.resonanceScore).toBe(90);
  });

  describe("keyword matching", () => {
    it("boosts score for matching preferences", async () => {
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "crypto", topic: "crypto", weight: 1, updatedAt: 0 },
      ]);

      const offers = [
        makeOffer("match", "Crypto Analysis", "deep crypto market review"),
        makeOffer("nomatch", "Weather Report", "sunny day forecast"),
      ];
      const result = await rankOffers(offers);

      const matchOffer = result.find((o) => o.id === "match")!;
      const noMatchOffer = result.find((o) => o.id === "nomatch")!;
      expect(matchOffer.resonanceScore).toBeGreaterThan(noMatchOffer.resonanceScore);
    });

    it("handles multiple matching preferences", async () => {
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "ai", topic: "ai", weight: 0.8, updatedAt: 0 },
        { id: "blockchain", topic: "blockchain", weight: 0.6, updatedAt: 0 },
      ]);

      const offers = [
        makeOffer("both", "AI Blockchain", "ai and blockchain combined"),
        makeOffer("one", "AI Only", "just ai stuff"),
        makeOffer("none", "Cooking", "recipe ideas"),
      ];
      const result = await rankOffers(offers);

      const bothMatch = result.find((o) => o.id === "both")!;
      const oneMatch = result.find((o) => o.id === "one")!;
      const noMatch = result.find((o) => o.id === "none")!;

      expect(bothMatch.resonanceScore).toBeGreaterThan(oneMatch.resonanceScore);
      expect(oneMatch.resonanceScore).toBeGreaterThan(noMatch.resonanceScore);
    });

    it("keyword matching is case-insensitive", async () => {
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "defi", topic: "DeFi", weight: 1, updatedAt: 0 },
      ]);

      const offers = [makeOffer("lc", "DEFI Protocol", "defi stuff")];
      const result = await rankOffers(offers);
      expect(result[0].resonanceScore).toBeGreaterThan(50);
    });

    it("clamps scores to 0-100 range", async () => {
      // Create many matching preferences to push score above 100
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "a", topic: "test", weight: 1, updatedAt: 0 },
        { id: "b", topic: "offer", weight: 1, updatedAt: 0 },
        { id: "c", topic: "great", weight: 1, updatedAt: 0 },
      ]);

      const offers = [makeOffer("1", "test offer great", "test offer great")];
      const result = await rankOffers(offers);
      expect(result[0].resonanceScore).toBeLessThanOrEqual(100);
      expect(result[0].resonanceScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("LLM ranking", () => {
    it("uses LLM when ready and preferences exist", async () => {
      vi.mocked(llm.isReady).mockReturnValue(true);
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "ai", topic: "ai", weight: 1, updatedAt: 0 },
      ]);
      vi.mocked(llm.generateCompletion).mockResolvedValue("[90, 30]");

      const offers = [makeOffer("1", "AI"), makeOffer("2", "Food")];
      const result = await rankOffers(offers);

      expect(llm.generateCompletion).toHaveBeenCalled();
      expect(result.find((o) => o.id === "1")!.resonanceScore).toBe(90);
      expect(result.find((o) => o.id === "2")!.resonanceScore).toBe(30);
    });

    it("falls back to keyword matching on LLM parse failure", async () => {
      vi.mocked(llm.isReady).mockReturnValue(true);
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "x", topic: "x", weight: 1, updatedAt: 0 },
      ]);
      vi.mocked(llm.generateCompletion).mockResolvedValue("not valid json");

      const offers = [makeOffer("1", "Test")];
      const result = await rankOffers(offers);

      // Should still produce results via keyword fallback
      expect(result).toHaveLength(1);
      expect(typeof result[0].resonanceScore).toBe("number");
    });

    it("clamps LLM scores to 0-100", async () => {
      vi.mocked(llm.isReady).mockReturnValue(true);
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "x", topic: "x", weight: 1, updatedAt: 0 },
      ]);
      vi.mocked(llm.generateCompletion).mockResolvedValue("[150, -20]");

      const offers = [makeOffer("high", "A"), makeOffer("low", "B")];
      const result = await rankOffers(offers);

      expect(result.find((o) => o.id === "high")!.resonanceScore).toBe(100);
      expect(result.find((o) => o.id === "low")!.resonanceScore).toBe(0);
    });

    it("uses default score 50 for missing LLM scores", async () => {
      vi.mocked(llm.isReady).mockReturnValue(true);
      vi.mocked(db.getPreferences).mockResolvedValue([
        { id: "x", topic: "x", weight: 1, updatedAt: 0 },
      ]);
      // Returns only 1 score for 2 offers
      vi.mocked(llm.generateCompletion).mockResolvedValue("[75]");

      const offers = [makeOffer("1", "A"), makeOffer("2", "B")];
      const result = await rankOffers(offers);

      expect(result.find((o) => o.id === "1")!.resonanceScore).toBe(75);
      expect(result.find((o) => o.id === "2")!.resonanceScore).toBe(50); // default
    });
  });

  it("caches computed rankings", async () => {
    const offers = [makeOffer("cache-me", "Test")];
    await rankOffers(offers);

    expect(db.cacheRanking).toHaveBeenCalledWith("cache-me", expect.any(Number));
  });

  it("sorts results by score descending", async () => {
    vi.mocked(db.getPreferences).mockResolvedValue([
      { id: "a", topic: "alpha", weight: 1, updatedAt: 0 },
    ]);

    const offers = [
      makeOffer("low", "Nothing", "no match"),
      makeOffer("high", "Alpha Topic", "alpha related"),
    ];
    const result = await rankOffers(offers);

    expect(result[0].id).toBe("high");
    expect(result[1].id).toBe("low");
    expect(result[0].resonanceScore).toBeGreaterThanOrEqual(result[1].resonanceScore);
  });
});
