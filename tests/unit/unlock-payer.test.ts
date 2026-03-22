import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChainType } from "@/types/offer";

/**
 * Tests for the payer parameter flow through unlockContent → recordPurchase,
 * and error handling edge cases in unlock.ts.
 */

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

vi.mock("@/services/verification", () => ({
  verify: vi.fn(),
}));

vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual("@/lib/constants");
  return {
    ...(actual as object),
    getRecipientAddress: (chain: string) => {
      const addrs: Record<string, string> = {
        base: "0xrecipient",
        solana: "sol-recipient",
        icp: "icp-recipient",
      };
      return addrs[chain] || null;
    },
  };
});

const { verify } = await import("@/services/verification");
const mockVerify = vi.mocked(verify);

const { unlockContent } = await import("@/services/content/unlock");
const { addOffer } = await import("@/services/content/store");

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  mockVerify.mockResolvedValue({ verified: true });
});

async function createOffer() {
  return addOffer({
    agentId: "agent",
    title: "Test",
    description: "desc",
    priceUsdc: 10,
    contentHash: "hash123",
    supportedChains: ["base", "solana", "icp"] as ChainType[],
    encryptedContent: "secret",
  });
}

describe("payer parameter flow", () => {
  it("passes payer address to submit_receipt", async () => {
    const offer = await createOffer();
    await unlockContent(offer.id, "tx-1", "base", "0xBuyerAddress");

    expect(mockActor.submit_receipt).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: "0xBuyerAddress",
        txHash: "tx-1",
        chain: "base",
        contentHash: "hash123",
        amount: BigInt(10_000_000),
        verified: true,
      }),
    );
  });

  it("defaults payer to 'anonymous' when undefined", async () => {
    const offer = await createOffer();
    await unlockContent(offer.id, "tx-2", "base");

    expect(mockActor.submit_receipt).toHaveBeenCalledWith(
      expect.objectContaining({ payer: "anonymous" }),
    );
  });

  it("defaults payer to 'anonymous' when empty string", async () => {
    const offer = await createOffer();
    await unlockContent(offer.id, "tx-3", "base", "");

    expect(mockActor.submit_receipt).toHaveBeenCalledWith(
      expect.objectContaining({ payer: "anonymous" }),
    );
  });

  it("preserves payer with special characters", async () => {
    const offer = await createOffer();
    await unlockContent(offer.id, "tx-4", "base", "0xCafé☕");

    expect(mockActor.submit_receipt).toHaveBeenCalledWith(
      expect.objectContaining({ payer: "0xCafé☕" }),
    );
  });

  it("passes correct contentHash and amount from the offer", async () => {
    const offer = await addOffer({
      agentId: "a",
      title: "Priced",
      description: "d",
      priceUsdc: 25,
      contentHash: "specific-hash",
      supportedChains: ["solana"] as ChainType[],
      encryptedContent: "data",
    });

    await unlockContent(offer.id, "tx-5", "solana", "sol-buyer");

    expect(mockActor.submit_receipt).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHash: "specific-hash",
        amount: BigInt(25_000_000),
        chain: "solana",
      }),
    );
  });
});

describe("error propagation in unlock", () => {
  it("propagates recordPurchase (submit_receipt) errors", async () => {
    const offer = await createOffer();
    mockActor.submit_receipt.mockRejectedValueOnce(new Error("Canister error"));

    await expect(
      unlockContent(offer.id, "tx-err", "base", "payer"),
    ).rejects.toThrow("Canister error");
  });

  it("propagates isTransactionUsed (get_receipt) errors", async () => {
    const offer = await createOffer();
    mockActor.get_receipt.mockRejectedValueOnce(new Error("Query timeout"));

    await expect(
      unlockContent(offer.id, "tx-err2", "base"),
    ).rejects.toThrow("Query timeout");
  });

  it("propagates getOffer (get_offer) errors", async () => {
    mockActor.get_offer.mockRejectedValueOnce(new Error("IC unreachable"));

    await expect(
      unlockContent("any-id", "tx-err3", "base"),
    ).rejects.toThrow("IC unreachable");
  });

  it("propagates verify() exceptions (not just verification failures)", async () => {
    const offer = await createOffer();
    mockVerify.mockRejectedValueOnce(new Error("RPC node down"));

    await expect(
      unlockContent(offer.id, "tx-err4", "base"),
    ).rejects.toThrow("RPC node down");
  });

  it("does not call submit_receipt when verification returns false", async () => {
    const offer = await createOffer();
    mockVerify.mockResolvedValueOnce({ verified: false, error: "bad tx" });

    const result = await unlockContent(offer.id, "tx-bad", "base");

    expect(result.success).toBe(false);
    expect(mockActor.submit_receipt).not.toHaveBeenCalled();
  });
});
