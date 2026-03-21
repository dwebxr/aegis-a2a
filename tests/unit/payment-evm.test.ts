import { describe, it, expect, vi } from "vitest";
import { payEvm } from "@/services/payment/evm";
import type { PaymentRequest } from "@/services/payment/types";

// Mock viem - we test the logic flow, not actual blockchain calls
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        blockNumber: 12345n,
      }),
    })),
  };
});

describe("payEvm", () => {
  const validRecipient = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  it("rejects invalid EVM recipient address", async () => {
    const req: PaymentRequest = {
      offerId: "o1",
      chain: "base",
      amount: 1,
      recipient: "not-an-address",
    };
    const result = await payEvm(req, {} as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("Invalid EVM recipient address");
    expect(result.txHash).toBe("");
  });

  it("rejects recipient without 0x prefix", async () => {
    const req: PaymentRequest = {
      offerId: "o1",
      chain: "base",
      amount: 1,
      recipient: "833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    };
    const result = await payEvm(req, {} as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("Invalid EVM recipient address");
  });

  it("rejects empty recipient", async () => {
    const req: PaymentRequest = {
      offerId: "o1",
      chain: "base",
      amount: 1,
      recipient: "",
    };
    const result = await payEvm(req, {} as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("Invalid EVM recipient address");
  });

  it("handles writeContract error gracefully", async () => {
    const walletClient = {
      getAddresses: vi.fn().mockResolvedValue(["0x1234567890123456789012345678901234567890"]),
      writeContract: vi.fn().mockRejectedValue(new Error("User rejected")),
    };

    const req: PaymentRequest = {
      offerId: "o1",
      chain: "base",
      amount: 1,
      recipient: validRecipient,
    };
    const result = await payEvm(req, walletClient as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("User rejected");
    expect(result.chain).toBe("base");
  });

  it("handles non-Error exceptions", async () => {
    const walletClient = {
      getAddresses: vi.fn().mockResolvedValue(["0x1234567890123456789012345678901234567890"]),
      writeContract: vi.fn().mockRejectedValue("string error"),
    };

    const req: PaymentRequest = {
      offerId: "o1",
      chain: "base",
      amount: 1,
      recipient: validRecipient,
    };
    const result = await payEvm(req, walletClient as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("EVM payment failed");
  });

  it("successful payment returns txHash and confirmed=true", async () => {
    const mockHash = "0xabcdef1234567890" as `0x${string}`;
    const walletClient = {
      getAddresses: vi.fn().mockResolvedValue(["0x1234567890123456789012345678901234567890"]),
      writeContract: vi.fn().mockResolvedValue(mockHash),
    };

    const req: PaymentRequest = {
      offerId: "o1",
      chain: "base",
      amount: 1,
      recipient: validRecipient,
    };
    const result = await payEvm(req, walletClient as any);
    expect(result.confirmed).toBe(true);
    expect(result.txHash).toBe(mockHash);
    expect(result.chain).toBe("base");
  });
});
