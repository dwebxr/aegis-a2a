import { describe, it, expect, vi } from "vitest";
import { paySolana } from "@/services/payment/solana";
import { PublicKey, Transaction, Connection } from "@solana/web3.js";
import type { PaymentRequest } from "@/services/payment/types";

// Mock the Connection class
vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();

  class MockConnection {
    constructor(_endpoint: string) {}
    getLatestBlockhash = vi.fn().mockResolvedValue({
      blockhash: "mockBlockhash111111111111111111111111111111",
      lastValidBlockHeight: 100,
    });
    sendRawTransaction = vi.fn().mockResolvedValue("mock-solana-sig-12345");
    confirmTransaction = vi.fn().mockResolvedValue({ value: { err: null } });
  }

  return {
    ...actual,
    Connection: MockConnection,
  };
});

vi.mock("@solana/spl-token", async (importOriginal) => {
  const solana = await vi.importActual("@solana/web3.js") as typeof import("@solana/web3.js");
  return {
    createTransferInstruction: vi.fn().mockReturnValue({
      programId: new solana.PublicKey("11111111111111111111111111111111"),
      keys: [],
      data: Buffer.alloc(0),
    }),
    getAssociatedTokenAddress: vi.fn().mockResolvedValue(
      new solana.PublicKey("11111111111111111111111111111111")
    ),
  };
});

describe("paySolana", () => {
  const validSolanaAddr = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  // Use a real valid base58 key for the wallet mock
  const senderKey = "11111111111111111111111111111111";

  function mockWallet() {
    const pk = new (require("@solana/web3.js").PublicKey)(senderKey);
    return {
      publicKey: pk,
      signTransaction: vi.fn().mockImplementation(async (tx: any) => {
        // Return a tx that can serialize. We mock serialize to return bytes.
        return { serialize: () => new Uint8Array(100) };
      }),
    };
  }

  it("rejects invalid Solana recipient address", async () => {
    const req: PaymentRequest = {
      offerId: "o1",
      chain: "solana",
      amount: 1,
      recipient: "not-valid!!!",
    };
    const result = await paySolana(req, mockWallet() as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("Invalid Solana recipient address");
    expect(result.txHash).toBe("");
  });

  it("rejects empty recipient", async () => {
    const req: PaymentRequest = {
      offerId: "o1",
      chain: "solana",
      amount: 1,
      recipient: "",
    };
    const result = await paySolana(req, mockWallet() as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("Invalid Solana recipient address");
  });

  it("successful payment returns txHash and confirmed=true", async () => {
    const req: PaymentRequest = {
      offerId: "o1",
      chain: "solana",
      amount: 5,
      recipient: validSolanaAddr,
    };
    const result = await paySolana(req, mockWallet() as any);
    expect(result.confirmed).toBe(true);
    expect(result.txHash).toBe("mock-solana-sig-12345");
    expect(result.chain).toBe("solana");
  });

  it("handles wallet rejection gracefully", async () => {
    const wallet = mockWallet();
    wallet.signTransaction = vi.fn().mockRejectedValue(new Error("User cancelled"));

    const req: PaymentRequest = {
      offerId: "o1",
      chain: "solana",
      amount: 1,
      recipient: validSolanaAddr,
    };
    const result = await paySolana(req, wallet as any);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("User cancelled");
    expect(result.chain).toBe("solana");
  });
});
