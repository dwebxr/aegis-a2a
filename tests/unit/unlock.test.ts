import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChainType } from "@/types/offer";

// In-memory canister state for testing
let canisterOffers: any[] = [];
let canisterReceipts: Map<string, any> = new Map();

const mockActor = {
  put_offer: vi.fn().mockImplementation(async (offer: any) => {
    const idx = canisterOffers.findIndex((o) => o.id === offer.id);
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

// Mock the verification service
vi.mock("@/services/verification", () => ({
  verify: vi.fn(),
}));

// Mock recipient address lookup
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual("@/lib/constants");
  return {
    ...(actual as object),
    getRecipientAddress: (chain: string) => {
      const addrs: Record<string, string> = {
        base: "0xrecipient-base",
        solana: "solana-recipient",
        icp: "icp-principal-recipient",
      };
      return addrs[chain] || null;
    },
  };
});

const { verify } = await import("@/services/verification");
const mockVerify = vi.mocked(verify);

const { unlockContent } = await import("@/services/content/unlock");
const { addOffer } = await import("@/services/content/store");

let testOfferId: string;

async function createOffer(overrides: Partial<{
  supportedChains: ChainType[];
  priceUsdc: number;
  encryptedContent: string;
}> = {}) {
  const offer = await addOffer({
    agentId: "agent-test",
    title: "Test Offer",
    description: "Test description",
    priceUsdc: 10,
    contentHash: "hash",
    supportedChains: ["base", "solana", "icp"],
    encryptedContent: "secret-content-here",
    ...overrides,
  });
  testOfferId = offer.id;
  return offer;
}

beforeEach(() => {
  vi.clearAllMocks();
  canisterOffers = [];
  canisterReceipts = new Map();
  mockVerify.mockResolvedValue({ verified: true });
});

describe("unlockContent", () => {
  describe("happy path", () => {
    it("unlocks content after successful payment verification", async () => {
      const offer = await createOffer();

      const result = await unlockContent(offer.id, "0xtx123", "base");
      expect(result.success).toBe(true);
      expect(result.content).toBe("secret-content-here");
      expect(result.error).toBeUndefined();
    });

    it("passes correct verification params", async () => {
      const offer = await createOffer({ priceUsdc: 25 });

      await unlockContent(offer.id, "0xtx456", "base");

      expect(mockVerify).toHaveBeenCalledWith({
        txHash: "0xtx456",
        chain: "base",
        expectedAmount: 25,
        expectedRecipient: "0xrecipient-base",
      });
    });

    it("works with each supported chain", async () => {
      for (const chain of ["base", "solana", "icp"] as ChainType[]) {
        const offer = await createOffer();
        const result = await unlockContent(offer.id, `tx-${chain}`, chain);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("offer validation", () => {
    it("fails when offer does not exist", async () => {
      const result = await unlockContent("non-existent-id", "0xtx", "base");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Offer not found");
    });

    it("fails when chain is not supported by offer", async () => {
      const offer = await createOffer({ supportedChains: ["base"] });

      const result = await unlockContent(offer.id, "0xtx", "solana");
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not support chain");
      expect(result.error).toContain("solana");
    });
  });

  describe("replay protection", () => {
    it("prevents using the same txHash twice for the same offer", async () => {
      const offer = await createOffer();

      const result1 = await unlockContent(offer.id, "0xtx-replay", "base");
      expect(result1.success).toBe(true);

      const result2 = await unlockContent(offer.id, "0xtx-replay", "base");
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("Transaction already used");
    });

    it("allows different txHash for same offer", async () => {
      const offer = await createOffer();

      const result1 = await unlockContent(offer.id, "0xtx-first", "base");
      expect(result1.success).toBe(true);

      const result2 = await unlockContent(offer.id, "0xtx-second", "base");
      expect(result2.success).toBe(true);
    });
  });

  describe("verification failure", () => {
    it("fails when payment verification fails", async () => {
      const offer = await createOffer();
      mockVerify.mockResolvedValue({
        verified: false,
        error: "Amount insufficient",
      });

      const result = await unlockContent(offer.id, "0xtx-bad", "base");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Payment verification failed");
      expect(result.error).toContain("Amount insufficient");
    });

    it("does not record purchase on verification failure", async () => {
      const offer = await createOffer();
      mockVerify.mockResolvedValue({ verified: false, error: "bad" });

      await unlockContent(offer.id, "0xtx-fail", "base");

      // Should be able to retry with same txHash since it wasn't recorded
      mockVerify.mockResolvedValue({ verified: true });
      const result = await unlockContent(offer.id, "0xtx-fail", "base");
      expect(result.success).toBe(true);
    });
  });

  describe("content handling", () => {
    it("returns 'Content unavailable' when no encrypted content", async () => {
      const offer = await createOffer({ encryptedContent: undefined as any });

      const result = await unlockContent(offer.id, "0xtx-no-content", "base");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Content unavailable");
    });

    it("returns empty string content if set", async () => {
      const offer = await createOffer({ encryptedContent: "" });

      const result = await unlockContent(offer.id, "0xtx-empty", "base");
      expect(result.success).toBe(true);
      // Empty string is falsy, so falls back to "Content unavailable"
      expect(result.content).toBe("Content unavailable");
    });
  });
});
