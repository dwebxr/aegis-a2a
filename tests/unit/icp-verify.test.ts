import { describe, it, expect, vi, beforeEach } from "vitest";

let mockGetTransactions: any = vi.fn();

vi.mock("@dfinity/agent", () => ({
  HttpAgent: {
    create: vi.fn().mockResolvedValue({}),
  },
  Actor: {
    createActor: vi.fn().mockImplementation(() => ({
      get_transactions: (...args: unknown[]) => mockGetTransactions(...args),
    })),
  },
}));

const { verifyIcpTransaction } = await import("@/services/verification/icp-verify");

const recipient = "rrkah-fqaaa-aaaaa-aaaaq-cai";

describe("verifyIcpTransaction", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset();
  });

  it("verifies a valid transfer", async () => {
    mockGetTransactions.mockResolvedValue({
      transactions: [{
        kind: "transfer",
        transfer: [{
          to: { owner: { toText: () => recipient } },
          amount: 5_000_000n,
        }],
      }],
    });

    const result = await verifyIcpTransaction({
      txHash: "42",
      chain: "icp",
      expectedAmount: 5,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(true);
    expect(result.blockNumber).toBe(42n);
    expect(result.actualAmount).toBe(5_000_000n);
    expect(result.actualRecipient).toBe(recipient);
  });

  it("rejects non-numeric txHash", async () => {
    const result = await verifyIcpTransaction({
      txHash: "not-a-number",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("not a valid block index");
    expect(mockGetTransactions).not.toHaveBeenCalled();
  });

  it("rejects negative block index", async () => {
    const result = await verifyIcpTransaction({
      txHash: "-5",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("non-negative");
    expect(mockGetTransactions).not.toHaveBeenCalled();
  });

  it("rejects when transaction not found", async () => {
    mockGetTransactions.mockResolvedValue({ transactions: [] });

    const result = await verifyIcpTransaction({
      txHash: "999",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects non-transfer transactions", async () => {
    mockGetTransactions.mockResolvedValue({
      transactions: [{
        kind: "mint",
        transfer: [],
      }],
    });

    const result = await verifyIcpTransaction({
      txHash: "10",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Not a transfer");
  });

  // Candid Opt returns [] for None
  it("rejects transfer with empty Opt ([] = None)", async () => {
    mockGetTransactions.mockResolvedValue({
      transactions: [{
        kind: "transfer",
        transfer: [],
      }],
    });

    const result = await verifyIcpTransaction({
      txHash: "10",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Not a transfer");
  });

  it("rejects recipient mismatch", async () => {
    const wrongRecipient = "aaaaa-aa";
    mockGetTransactions.mockResolvedValue({
      transactions: [{
        kind: "transfer",
        transfer: [{
          to: { owner: { toText: () => wrongRecipient } },
          amount: 1_000_000n,
        }],
      }],
    });

    const result = await verifyIcpTransaction({
      txHash: "10",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBe("Recipient mismatch");
    expect(result.actualRecipient).toBe(wrongRecipient);
  });

  it("rejects insufficient amount", async () => {
    mockGetTransactions.mockResolvedValue({
      transactions: [{
        kind: "transfer",
        transfer: [{
          to: { owner: { toText: () => recipient } },
          amount: 500_000n,
        }],
      }],
    });

    const result = await verifyIcpTransaction({
      txHash: "10",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBe("Amount insufficient");
    expect(result.actualAmount).toBe(500_000n);
  });

  it("passes correct block index and length to get_transactions", async () => {
    mockGetTransactions.mockResolvedValue({ transactions: [] });

    await verifyIcpTransaction({
      txHash: "777",
      chain: "icp",
      expectedAmount: 1,
      expectedRecipient: recipient,
    });

    expect(mockGetTransactions).toHaveBeenCalledWith({
      start: 777n,
      length: 1n,
    });
  });
});
