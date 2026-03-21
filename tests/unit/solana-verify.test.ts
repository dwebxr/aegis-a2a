import { describe, it, expect, vi, beforeEach } from "vitest";
import { usdcToUnits } from "@/lib/constants";

let mockTxResult: any = null;

vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  class MockConnection {
    constructor(_endpoint: string) {}
    getTransaction = vi.fn().mockImplementation(async () => mockTxResult);
  }
  return {
    ...actual,
    Connection: MockConnection,
  };
});

const { verifySolanaTransaction } = await import("@/services/verification/solana-verify");

function makeTx(opts: {
  err?: unknown;
  preOwner?: string;
  preAmount?: string;
  postOwner?: string;
  postAmount?: string;
  slot?: number;
}) {
  return {
    slot: opts.slot ?? 12345,
    meta: {
      err: opts.err ?? null,
      preTokenBalances: opts.preOwner
        ? [{ owner: opts.preOwner, uiTokenAmount: { amount: opts.preAmount ?? "0" } }]
        : [],
      postTokenBalances: opts.postOwner
        ? [{ owner: opts.postOwner, uiTokenAmount: { amount: opts.postAmount ?? "0" } }]
        : [],
    },
  };
}

const recipient = "SoLRecipientAddr11111111111111111111111111111";

describe("verifySolanaTransaction", () => {
  beforeEach(() => {
    mockTxResult = null;
  });

  it("verifies a valid SPL token transfer", async () => {
    mockTxResult = makeTx({
      preOwner: recipient,
      preAmount: "0",
      postOwner: recipient,
      postAmount: "5000000",
    });

    const result = await verifySolanaTransaction({
      txHash: "sig123",
      chain: "solana",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(true);
    expect(result.actualAmount).toBe(5_000_000n);
    expect(result.blockNumber).toBe(12345n);
  });

  it("rejects when transaction not found", async () => {
    mockTxResult = null;

    const result = await verifySolanaTransaction({
      txHash: "nonexistent",
      chain: "solana",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBe("Transaction not found");
  });

  it("rejects when transaction has error", async () => {
    mockTxResult = makeTx({ err: { InstructionError: [0, "Custom"] } });

    const result = await verifySolanaTransaction({
      txHash: "sig-fail",
      chain: "solana",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Transaction failed");
  });

  it("rejects when recipient not in token balances", async () => {
    mockTxResult = makeTx({
      postOwner: "DifferentAddress",
      postAmount: "5000000",
    });

    const result = await verifySolanaTransaction({
      txHash: "sig",
      chain: "solana",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBe("Recipient not found in transaction");
  });

  it("rejects when amount is insufficient", async () => {
    mockTxResult = makeTx({
      preOwner: recipient,
      preAmount: "0",
      postOwner: recipient,
      postAmount: "3000000",
    });

    const result = await verifySolanaTransaction({
      txHash: "sig",
      chain: "solana",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBe("Amount insufficient");
    expect(result.actualAmount).toBe(3_000_000n);
  });

  it("accepts overpayment", async () => {
    mockTxResult = makeTx({
      preOwner: recipient,
      preAmount: "0",
      postOwner: recipient,
      postAmount: "10000000",
    });

    const result = await verifySolanaTransaction({
      txHash: "sig",
      chain: "solana",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(true);
    expect(result.actualAmount).toBe(10_000_000n);
  });

  it("handles recipient with no pre-balance (new account)", async () => {
    mockTxResult = makeTx({
      postOwner: recipient,
      postAmount: "5000000",
    });

    const result = await verifySolanaTransaction({
      txHash: "sig",
      chain: "solana",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(true);
    expect(result.actualAmount).toBe(5_000_000n);
  });

  it("calculates received as post minus pre balance", async () => {
    mockTxResult = makeTx({
      preOwner: recipient,
      preAmount: "2000000",
      postOwner: recipient,
      postAmount: "7000000",
    });

    const result = await verifySolanaTransaction({
      txHash: "sig",
      chain: "solana",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(true);
    expect(result.actualAmount).toBe(5_000_000n);
  });
});
