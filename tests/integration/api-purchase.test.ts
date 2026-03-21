import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/purchase/route";
import { NextRequest } from "next/server";
import { addOffer, removeOffer, _resetForTesting } from "@/services/content/store";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
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

const createdIds: string[] = [];

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/agent/purchase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function addTestOffer() {
  const offer = addOffer({
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
  _resetForTesting();
  createdIds.length = 0;
});

describe("POST /api/agent/purchase", () => {
  it("returns content on successful purchase", async () => {
    const offer = addTestOffer();

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
    const offer = addTestOffer();
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
    const offer = addTestOffer();

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
      const offer = addTestOffer();
      const res = await POST(makeRequest({
        offerId: offer.id,
        txHash: `0x-${chain}-tx`,
        chain,
      }));
      expect(res.status).toBe(200);
    }
  });
});
