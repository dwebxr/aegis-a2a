import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/purchase/route";
import { NextRequest } from "next/server";

// In-memory canister state for testing
let canisterOffers: any[] = [];
let canisterReceipts: Map<string, any> = new Map();

const mockActor = {
  put_offer: vi.fn().mockImplementation(async (offer: any) => {
    const idx = canisterOffers.findIndex((o: any) => o.id === offer.id);
    if (idx >= 0) canisterOffers[idx] = offer;
    else canisterOffers.push(offer);
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

// Mock verification to avoid real RPC calls
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

const createdIds: string[] = [];

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/agent/purchase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function addTestOffer() {
  const offer = await addOffer({
    agentId: "agent-1",
    title: "Premium Intel",
    description: "desc",
    priceUsdc: 10,
    contentHash: "",
    supportedChains: ["base", "solana", "icp"],
    encryptedContent: "TOP SECRET CONTENT",
  });
  createdIds.push(offer.id);
  return offer;
}

beforeEach(() => {
  mockVerify.mockClear();
  mockVerify.mockResolvedValue({ verified: true });
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  // Re-apply mockVerify after clearAllMocks
  mockVerify.mockResolvedValue({ verified: true });
  createdIds.length = 0;
});

describe("POST /api/agent/purchase", () => {
  it("returns content on successful purchase", async () => {
    const offer = await addTestOffer();

    const res = await POST(makeRequest({
      offerId: offer.id,
      txHash: "0xpurchase-tx",
      chain: "base",
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toBe("TOP SECRET CONTENT");
  });

  it("returns 402 for failed verification", async () => {
    const offer = await addTestOffer();
    mockVerify.mockResolvedValue({ verified: false, error: "Amount insufficient" });

    const res = await POST(makeRequest({
      offerId: offer.id,
      txHash: "0xbad-tx",
      chain: "base",
    }));

    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toContain("Amount insufficient");
  });

  it("returns 402 for non-existent offer", async () => {
    const res = await POST(makeRequest({
      offerId: "fake-id",
      txHash: "0xtx",
      chain: "base",
    }));

    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toContain("Offer not found");
  });

  it("returns 402 on replay (same txHash)", async () => {
    const offer = await addTestOffer();

    const res1 = await POST(makeRequest({
      offerId: offer.id,
      txHash: "0xreplay-tx",
      chain: "base",
    }));
    expect(res1.status).toBe(200);

    const res2 = await POST(makeRequest({
      offerId: offer.id,
      txHash: "0xreplay-tx",
      chain: "base",
    }));
    expect(res2.status).toBe(402);
    const data = await res2.json();
    expect(data.error).toContain("already used");
  });

  describe("validation errors (400)", () => {
    it("rejects missing offerId", async () => {
      const res = await POST(makeRequest({ txHash: "0x", chain: "base" }));
      expect(res.status).toBe(400);
    });

    it("rejects missing txHash", async () => {
      const res = await POST(makeRequest({ offerId: "o1", chain: "base" }));
      expect(res.status).toBe(400);
    });

    it("rejects missing chain", async () => {
      const res = await POST(makeRequest({ offerId: "o1", txHash: "0x" }));
      expect(res.status).toBe(400);
    });

    it("rejects invalid chain", async () => {
      const res = await POST(makeRequest({
        offerId: "o1",
        txHash: "0x",
        chain: "polygon",
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid chain");
    });
  });

  it("works with all supported chains", async () => {
    for (const chain of ["base", "solana", "icp"]) {
      const offer = await addTestOffer();
      const res = await POST(makeRequest({
        offerId: offer.id,
        txHash: `0x-${chain}-tx`,
        chain,
      }));
      expect(res.status).toBe(200);
    }
  });
});
