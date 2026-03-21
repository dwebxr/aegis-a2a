import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/health/route";
import { _resetForTesting } from "@/services/content/store";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
}));

vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual("@/lib/constants");
  return {
    ...(actual as object),
    getRecipientAddress: (chain: string) => {
      if (chain === "base") return "0xrecipient";
      return null;
    },
  };
});

beforeEach(() => {
  _resetForTesting();
});

describe("GET /api/health", () => {
  it("returns 200 with status ok when store is accessible", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
    expect(data.store.ok).toBe(true);
    expect(typeof data.store.offers).toBe("number");
  });

  it("reports configured and missing chains", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.configuredChains).toEqual(["base"]);
    expect(data.missingConfig).toContain("solana");
    expect(data.missingConfig).toContain("icp");
  });

  it("includes offer count from store", async () => {
    const { addOffer } = await import("@/services/content/store");
    addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
    });

    const res = await GET();
    const data = await res.json();

    expect(data.store.offers).toBe(1);
  });
});
