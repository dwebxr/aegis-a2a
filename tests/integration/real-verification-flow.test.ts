/**
 * TRUE integration test: publish → purchase with REAL verification logic.
 * Only the RPC/network layer is mocked (viem's createPublicClient).
 * The verification dispatcher, EVM log parsing, and unlock flow all run real code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as publishPost } from "@/app/api/agent/publish/route";
import { POST as purchasePost } from "@/app/api/agent/purchase/route";
import { NextRequest } from "next/server";
import { USDC_ADDRESSES, usdcToUnits } from "@/lib/constants";
import { keccak256, toHex, pad, numberToHex } from "viem";

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

// Mock ONLY the RPC client - everything else runs real code
let mockReceipt: any = null;

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransactionReceipt: vi.fn().mockImplementation(async () => {
        if (!mockReceipt) throw new Error("Transaction not found");
        return mockReceipt;
      }),
    })),
  };
});

// Mock the recipient addresses
vi.mock("@/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/constants")>();
  return {
    ...actual,
    getRecipientAddress: (chain: string) => {
      const addrs: Record<string, string> = {
        base: "0x2222222222222222222222222222222222222222",
        solana: "sol-recipient",
        icp: "icp-recipient",
      };
      return addrs[chain] || null;
    },
  };
});

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const RECIPIENT = "0x2222222222222222222222222222222222222222";

function makeValidReceipt(amount: number) {
  return {
    status: "success",
    blockNumber: 12345n,
    logs: [
      {
        address: USDC_ADDRESSES.base,
        data: pad(numberToHex(usdcToUnits(amount)), { size: 32 }),
        topics: [
          TRANSFER_TOPIC,
          pad("0x1111111111111111111111111111111111111111" as `0x${string}`, { size: 32 }),
          pad(RECIPIENT as `0x${string}`, { size: 32 }),
        ],
        blockNumber: 12345n,
        transactionHash: "0xhash" as `0x${string}`,
        logIndex: 0,
        blockHash: "0xblockhash" as `0x${string}`,
        transactionIndex: 0,
        removed: false,
      },
    ],
  };
}

function req(url: string, body: object) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const qualityVcl = {
  originality: 8.5,
  insight: 9.0,
  credibility: 8.8,
  composite: 8.8,
  verdict: "quality" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  mockReceipt = null;
});

describe("Real verification integration flow", () => {
  it("publish → purchase with real EVM verification succeeds", async () => {
    // 1. Publish an offer
    const pubRes = await publishPost(req("http://localhost/api/agent/publish", {
      agentId: "agent-1",
      title: "Real Intel",
      description: "Verified content",
      priceUsdc: 5,
      content: "This content was verified through real EVM log parsing",
      supportedChains: ["base"],
      vclScores: qualityVcl,
    }));
    expect(pubRes.status).toBe(201);
    const { offerId } = await pubRes.json();

    // 2. Set up a REAL transaction receipt with correct Transfer log
    mockReceipt = makeValidReceipt(5);

    // 3. Purchase - this runs REAL verification logic
    const buyRes = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xreal-tx-hash-that-gets-verified",
      chain: "base",
    }));

    expect(buyRes.status).toBe(200);
    const { content } = await buyRes.json();
    expect(content).toBe("This content was verified through real EVM log parsing");
  });

  it("rejects purchase when on-chain amount is insufficient", async () => {
    // Publish offer for 10 USDC
    const pubRes = await publishPost(req("http://localhost/api/agent/publish", {
      agentId: "agent-1",
      title: "Expensive Intel",
      description: "d",
      priceUsdc: 10,
      content: "should not be revealed",
      supportedChains: ["base"],
      vclScores: qualityVcl,
    }));
    const { offerId } = await pubRes.json();

    // Receipt shows only 5 USDC transferred (insufficient)
    mockReceipt = makeValidReceipt(5);

    const buyRes = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xunderpaid-tx",
      chain: "base",
    }));

    expect(buyRes.status).toBe(402);
    const data = await buyRes.json();
    expect(data.error).toContain("Amount insufficient");
  });

  it("rejects purchase when recipient address doesn't match", async () => {
    const pubRes = await publishPost(req("http://localhost/api/agent/publish", {
      agentId: "agent-1",
      title: "Intel",
      description: "d",
      priceUsdc: 1,
      content: "secret",
      supportedChains: ["base"],
      vclScores: qualityVcl,
    }));
    const { offerId } = await pubRes.json();

    // Receipt with WRONG recipient
    const wrongRecipient = "0x3333333333333333333333333333333333333333";
    mockReceipt = {
      status: "success",
      blockNumber: 100n,
      logs: [
        {
          address: USDC_ADDRESSES.base,
          data: pad(numberToHex(usdcToUnits(1)), { size: 32 }),
          topics: [
            TRANSFER_TOPIC,
            pad("0x1111111111111111111111111111111111111111" as `0x${string}`, { size: 32 }),
            pad(wrongRecipient as `0x${string}`, { size: 32 }),
          ],
          blockNumber: 100n,
          transactionHash: "0xhash" as `0x${string}`,
          logIndex: 0,
          blockHash: "0xblockhash" as `0x${string}`,
          transactionIndex: 0,
          removed: false,
        },
      ],
    };

    const buyRes = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xwrong-recipient-tx",
      chain: "base",
    }));

    expect(buyRes.status).toBe(402);
    const data = await buyRes.json();
    expect(data.error).toContain("Recipient mismatch");
  });

  it("rejects purchase when transaction is reverted", async () => {
    const pubRes = await publishPost(req("http://localhost/api/agent/publish", {
      agentId: "agent-1",
      title: "Intel",
      description: "d",
      priceUsdc: 1,
      content: "secret",
      supportedChains: ["base"],
      vclScores: qualityVcl,
    }));
    const { offerId } = await pubRes.json();

    mockReceipt = { status: "reverted", logs: [] };

    const buyRes = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xreverted-tx",
      chain: "base",
    }));

    expect(buyRes.status).toBe(402);
    const data = await buyRes.json();
    expect(data.error).toContain("Transaction reverted");
  });

  it("rejects purchase when transaction not found on chain", async () => {
    const pubRes = await publishPost(req("http://localhost/api/agent/publish", {
      agentId: "agent-1",
      title: "Intel",
      description: "d",
      priceUsdc: 1,
      content: "secret",
      supportedChains: ["base"],
      vclScores: qualityVcl,
    }));
    const { offerId } = await pubRes.json();

    // mockReceipt = null → getTransactionReceipt throws "not found"

    const buyRes = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xnonexistent-tx",
      chain: "base",
    }));

    expect(buyRes.status).toBe(402);
    const data = await buyRes.json();
    expect(data.error).toContain("Transaction not found");
  });

  it("replay protection persists across separate purchase calls", async () => {
    const pubRes = await publishPost(req("http://localhost/api/agent/publish", {
      agentId: "agent-1",
      title: "Intel",
      description: "d",
      priceUsdc: 1,
      content: "secret",
      supportedChains: ["base"],
      vclScores: qualityVcl,
    }));
    const { offerId } = await pubRes.json();

    mockReceipt = makeValidReceipt(1);

    // First purchase succeeds
    const buy1 = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xsame-tx",
      chain: "base",
    }));
    expect(buy1.status).toBe(200);

    // Second with same tx is blocked - even though receipt would verify
    const buy2 = await purchasePost(req("http://localhost/api/agent/purchase", {
      offerId,
      txHash: "0xsame-tx",
      chain: "base",
    }));
    expect(buy2.status).toBe(402);
    const data = await buy2.json();
    expect(data.error).toContain("already used");
  });
});
