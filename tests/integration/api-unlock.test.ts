import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/unlock/route";
import { NextRequest } from "next/server";
import { addOffer, removeOffer, _resetForTesting } from "@/services/content/store";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
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

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/unlock", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockVerify.mockClear();
  mockVerify.mockResolvedValue({ verified: true });
  _resetForTesting();
  createdIds.length = 0;
});

describe("POST /api/unlock", () => {
  it("unlocks content using contentHash as offerId", async () => {
    const offer = addOffer({
      agentId: "a",
      title: "T",
      description: "D",
      priceUsdc: 1,
      contentHash: "",
      supportedChains: ["base"],
      encryptedContent: "UNLOCKED DATA",
    });
    createdIds.push(offer.id);

    const res = await POST(makeRequest({
      contentHash: offer.id,
      txHash: "0xunlock-tx",
      chain: "base",
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toBe("UNLOCKED DATA");
  });

  it("returns 400 for missing fields", async () => {
    const res = await POST(makeRequest({ contentHash: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid chain", async () => {
    const res = await POST(makeRequest({
      contentHash: "x",
      txHash: "0x",
      chain: "invalid",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 402 when content not found", async () => {
    const res = await POST(makeRequest({
      contentHash: "nonexistent",
      txHash: "0x",
      chain: "base",
    }));
    expect(res.status).toBe(402);
  });
});
