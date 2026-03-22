import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/unlock/route";
import { NextRequest } from "next/server";

let canisterOffers: any[] = [];
let canisterReceipts: Map<string, any> = new Map();

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
  submit_receipt: vi.fn().mockImplementation(async (receipt: any) => {
    canisterReceipts.set(receipt.txHash, receipt);
  }),
  get_receipt: vi.fn().mockImplementation(async (txHash: string) => {
    const r = canisterReceipts.get(txHash);
    return r ? [r] : [];
  }),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
}));

const mockVerify = vi.fn().mockResolvedValue({ verified: true });
vi.mock("@/services/verification", () => ({
  verify: (...args: any[]) => mockVerify(...args),
}));

vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual("@/lib/constants");
  return {
    ...(actual as object),
    getRecipientAddress: (chain: string) => {
      const m: Record<string, string> = { base: "0xrecipient", solana: "sol-recipient", icp: "icp-recipient" };
      return m[chain] || null;
    },
  };
});

const { addOffer } = await import("@/services/content/store");

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/unlock", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  mockVerify.mockResolvedValue({ verified: true });
});

describe("POST /api/unlock", () => {
  it("unlocks content with offerId", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
      encryptedContent: "UNLOCKED DATA",
    });

    const res = await POST(makeRequest({
      offerId: offer.id,
      txHash: "0xunlock-tx",
      chain: "base",
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toBe("UNLOCKED DATA");
  });

  it("returns 400 for missing offerId", async () => {
    const res = await POST(makeRequest({ txHash: "0x", chain: "base" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing txHash", async () => {
    const res = await POST(makeRequest({ offerId: "x", chain: "base" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid chain", async () => {
    const res = await POST(makeRequest({
      offerId: "x",
      txHash: "0x",
      chain: "invalid",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 402 when offer not found", async () => {
    const res = await POST(makeRequest({
      offerId: "nonexistent",
      txHash: "0x",
      chain: "base",
    }));
    expect(res.status).toBe(402);
  });
});
