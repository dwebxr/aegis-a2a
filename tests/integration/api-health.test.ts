import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/health/route";

// In-memory canister state for testing
let canisterOffers: any[] = [];

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
  submit_receipt: vi.fn().mockResolvedValue(undefined),
  get_receipt: vi.fn().mockResolvedValue([]),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
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
  vi.clearAllMocks();
  canisterOffers = [];
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
    await addOffer({
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
