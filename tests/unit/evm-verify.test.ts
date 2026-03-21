import { describe, it, expect, vi, beforeEach } from "vitest";
import { USDC_ADDRESSES, usdcToUnits } from "@/lib/constants";
import { pad, numberToHex, keccak256, toHex } from "viem";

let mockReceiptValue: any = null;

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransactionReceipt: vi.fn().mockImplementation(async () => {
        if (mockReceiptValue === null) throw new Error("Transaction not found");
        return mockReceiptValue;
      }),
    })),
  };
});

const { verifyEvmTransaction } = await import("@/services/verification/evm-verify");

// Manually construct a Transfer event log (topic0 = keccak256("Transfer(address,address,uint256)"))
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

function makeTransferLog(from: string, to: string, value: bigint) {
  return {
    address: USDC_ADDRESSES.base,
    data: pad(numberToHex(value), { size: 32 }),
    topics: [
      TRANSFER_TOPIC,
      pad(from as `0x${string}`, { size: 32 }),
      pad(to as `0x${string}`, { size: 32 }),
    ] as [`0x${string}`, `0x${string}`, `0x${string}`],
    blockNumber: 100n,
    transactionHash: "0xhash" as `0x${string}`,
    logIndex: 0,
    blockHash: "0xblockhash" as `0x${string}`,
    transactionIndex: 0,
    removed: false,
  };
}

const sender = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";

describe("verifyEvmTransaction", () => {
  beforeEach(() => {
    mockReceiptValue = null;
  });

  it("verifies a valid transaction", async () => {
    const amount = usdcToUnits(10);
    mockReceiptValue = {
      status: "success",
      blockNumber: 555n,
      logs: [makeTransferLog(sender, recipient, amount)],
    };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 10,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(true);
    expect(result.blockNumber).toBe(555n);
    expect(result.actualAmount).toBe(amount);
    expect(result.actualRecipient).toBe(recipient);
  });

  it("rejects reverted transaction", async () => {
    mockReceiptValue = { status: "reverted", logs: [] };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(false);
    expect(result.error).toBe("Transaction reverted");
  });

  it("rejects when no USDC transfer log found", async () => {
    mockReceiptValue = { status: "success", logs: [], blockNumber: 100n };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(false);
    expect(result.error).toBe("No USDC transfer found in transaction");
  });

  it("rejects when recipient does not match", async () => {
    const wrongRecipient = "0x3333333333333333333333333333333333333333";
    mockReceiptValue = {
      status: "success",
      blockNumber: 100n,
      logs: [makeTransferLog(sender, wrongRecipient, usdcToUnits(10))],
    };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 10,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(false);
    expect(result.error).toBe("Recipient mismatch");
    expect(result.actualRecipient).toBe(wrongRecipient);
  });

  it("rejects when amount is insufficient", async () => {
    mockReceiptValue = {
      status: "success",
      blockNumber: 100n,
      logs: [makeTransferLog(sender, recipient, usdcToUnits(5))],
    };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 10,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(false);
    expect(result.error).toBe("Amount insufficient");
    expect(result.actualAmount).toBe(usdcToUnits(5));
  });

  it("accepts overpayment (amount > expected)", async () => {
    mockReceiptValue = {
      status: "success",
      blockNumber: 100n,
      logs: [makeTransferLog(sender, recipient, usdcToUnits(20))],
    };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 10,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(true);
  });

  it("recipient comparison is case-insensitive", async () => {
    mockReceiptValue = {
      status: "success",
      blockNumber: 100n,
      logs: [makeTransferLog(sender, recipient, usdcToUnits(10))],
    };

    const result = await verifyEvmTransaction({
      txHash: "0xhash",
      chain: "base",
      expectedAmount: 10,
      expectedRecipient: recipient.toLowerCase(),
    });
    expect(result.verified).toBe(true);
  });

  it("handles RPC error gracefully", async () => {
    // mockReceiptValue = null means getTransactionReceipt will throw
    const result = await verifyEvmTransaction({
      txHash: "0xbadtx",
      chain: "base",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });
    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Transaction not found");
  });
});
