import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as publishPost } from "@/app/api/agent/publish/route";
import { GET as offersGet } from "@/app/api/agent/offers/route";
import { POST as purchasePost } from "@/app/api/agent/purchase/route";
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

const createdIds: string[] = [];

const qualityVcl = {
  originality: 8.5,
  insight: 9.0,
  credibility: 8.8,
  composite: 8.8,
  verdict: "quality" as const,
};

beforeEach(() => {
  mockVerify.mockClear();
  mockVerify.mockResolvedValue({ verified: true });
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  mockVerify.mockResolvedValue({ verified: true });
  createdIds.length = 0;
});

describe("Full agent-to-agent flow", () => {
  it("publish → list → purchase → receive content", async () => {
    // 1. Agent publishes an offer
    const publishRes = await publishPost(
      new NextRequest("http://localhost/api/agent/publish", {
        method: "POST",
        body: JSON.stringify({
          agentId: "openclaw-agent",
          title: "Onchain Alpha: DEX Volume Spike",
          description: "Detected unusual DEX volume on Base L2",
          priceUsdc: 2.5,
          content: "BASE DEX volumes spiked 340% in last 4h. Key pairs: WETH/USDC on Aerodrome.",
          supportedChains: ["base", "solana"],
          vclScores: qualityVcl,
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(publishRes.status).toBe(201);
    const { offerId } = await publishRes.json();
    createdIds.push(offerId);

    // 2. Buyer agent queries available offers
    const listRes = await offersGet(
      new NextRequest("http://localhost/api/agent/offers?chain=base")
    );
    expect(listRes.status).toBe(200);
    const { offers } = await listRes.json();

    const targetOffer = offers.find((o: any) => o.id === offerId);
    expect(targetOffer).toBeDefined();
    expect(targetOffer.title).toBe("Onchain Alpha: DEX Volume Spike");
    expect(targetOffer.priceUsdc).toBe(2.5); // preserved via micro-USDC encoding
    expect(targetOffer.supportedChains).toContain("base");
    expect(targetOffer.encryptedContent).toBeUndefined();

    // 3. Buyer pays and purchases
    const purchaseRes = await purchasePost(
      new NextRequest("http://localhost/api/agent/purchase", {
        method: "POST",
        body: JSON.stringify({
          offerId,
          txHash: "0xreal-payment-tx-hash-123",
          chain: "base",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(purchaseRes.status).toBe(200);
    const { content } = await purchaseRes.json();
    expect(content).toBe(
      "BASE DEX volumes spiked 340% in last 4h. Key pairs: WETH/USDC on Aerodrome."
    );

    // 4. Replay protection
    const replayRes = await purchasePost(
      new NextRequest("http://localhost/api/agent/purchase", {
        method: "POST",
        body: JSON.stringify({
          offerId,
          txHash: "0xreal-payment-tx-hash-123",
          chain: "base",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(replayRes.status).toBe(402);
  });

  it("multiple agents publishing and buying concurrently", async () => {
    const publishPromises = ["A", "B", "C"].map((name) =>
      publishPost(
        new NextRequest("http://localhost/api/agent/publish", {
          method: "POST",
          body: JSON.stringify({
            agentId: `agent-${name}`,
            title: `Offer ${name}`,
            description: `From agent ${name}`,
            priceUsdc: 1,
            content: `Content ${name}`,
            vclScores: qualityVcl,
          }),
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const results = await Promise.all(publishPromises);
    const offerIds: string[] = [];
    for (const res of results) {
      expect(res.status).toBe(201);
      const data = await res.json();
      offerIds.push(data.offerId);
      createdIds.push(data.offerId);
    }

    expect(new Set(offerIds).size).toBe(3);

    // Purchase all 3 concurrently
    const purchasePromises = offerIds.map((id, i) =>
      purchasePost(
        new NextRequest("http://localhost/api/agent/purchase", {
          method: "POST",
          body: JSON.stringify({
            offerId: id,
            txHash: `0xconcurrent-tx-${i}`,
            chain: "base",
          }),
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const purchaseResults = await Promise.all(purchasePromises);
    const contents: string[] = [];
    for (const res of purchaseResults) {
      expect(res.status).toBe(200);
      const data = await res.json();
      contents.push(data.content);
    }

    expect(contents).toContain("Content A");
    expect(contents).toContain("Content B");
    expect(contents).toContain("Content C");
  });

  it("cross-chain purchase - same offer, different chains", async () => {
    const publishRes = await publishPost(
      new NextRequest("http://localhost/api/agent/publish", {
        method: "POST",
        body: JSON.stringify({
          agentId: "multi-chain-seller",
          title: "Multi-chain Intel",
          description: "Available on all chains",
          priceUsdc: 5,
          content: "Cross-chain intelligence data",
          supportedChains: ["base", "solana", "icp"],
          vclScores: qualityVcl,
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    const { offerId } = await publishRes.json();
    createdIds.push(offerId);

    // Buy on base
    const baseRes = await purchasePost(
      new NextRequest("http://localhost/api/agent/purchase", {
        method: "POST",
        body: JSON.stringify({ offerId, txHash: "0xbase-tx", chain: "base" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(baseRes.status).toBe(200);

    // Buy same offer on solana with different tx
    const solRes = await purchasePost(
      new NextRequest("http://localhost/api/agent/purchase", {
        method: "POST",
        body: JSON.stringify({ offerId, txHash: "solana-sig-xyz", chain: "solana" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(solRes.status).toBe(200);
    const solData = await solRes.json();
    expect(solData.content).toBe("Cross-chain intelligence data");
  });
});
