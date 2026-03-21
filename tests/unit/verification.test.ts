import { describe, it, expect, vi, beforeEach } from "vitest";
import { verify } from "@/services/verification/index";

// Mock verifiers but TRACK calls
const mockVerifyEvm = vi.fn();
const mockVerifySolana = vi.fn();
const mockVerifyIcp = vi.fn();

vi.mock("@/services/verification/evm-verify", () => ({
  verifyEvmTransaction: (...args: unknown[]) => mockVerifyEvm(...args),
}));
vi.mock("@/services/verification/solana-verify", () => ({
  verifySolanaTransaction: (...args: unknown[]) => mockVerifySolana(...args),
}));
vi.mock("@/services/verification/icp-verify", () => ({
  verifyIcpTransaction: (...args: unknown[]) => mockVerifyIcp(...args),
}));

describe("verification dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyEvm.mockResolvedValue({ verified: true, blockNumber: 100n });
    mockVerifySolana.mockResolvedValue({ verified: true, blockNumber: 200n });
    mockVerifyIcp.mockResolvedValue({ verified: true, blockNumber: 300n });
  });

  it("routes base to EVM verifier with exact request", async () => {
    const req = {
      txHash: "0xhash123",
      chain: "base" as const,
      expectedAmount: 5,
      expectedRecipient: "0xaddr",
    };

    await verify(req);

    expect(mockVerifyEvm).toHaveBeenCalledOnce();
    expect(mockVerifyEvm).toHaveBeenCalledWith(req);
    expect(mockVerifySolana).not.toHaveBeenCalled();
    expect(mockVerifyIcp).not.toHaveBeenCalled();
  });

  it("routes solana to Solana verifier with exact request", async () => {
    const req = {
      txHash: "sig456",
      chain: "solana" as const,
      expectedAmount: 10,
      expectedRecipient: "soladdr",
    };

    await verify(req);

    expect(mockVerifySolana).toHaveBeenCalledOnce();
    expect(mockVerifySolana).toHaveBeenCalledWith(req);
    expect(mockVerifyEvm).not.toHaveBeenCalled();
    expect(mockVerifyIcp).not.toHaveBeenCalled();
  });

  it("routes icp to ICP verifier with exact request", async () => {
    const req = {
      txHash: "789",
      chain: "icp" as const,
      expectedAmount: 1,
      expectedRecipient: "principal",
    };

    await verify(req);

    expect(mockVerifyIcp).toHaveBeenCalledOnce();
    expect(mockVerifyIcp).toHaveBeenCalledWith(req);
    expect(mockVerifyEvm).not.toHaveBeenCalled();
    expect(mockVerifySolana).not.toHaveBeenCalled();
  });

  it("returns verifier result unchanged (does not transform)", async () => {
    const evmResult = {
      verified: true,
      blockNumber: 999n,
      actualAmount: 5_000_000n,
      actualRecipient: "0xreal",
    };
    mockVerifyEvm.mockResolvedValue(evmResult);

    const result = await verify({
      txHash: "0x",
      chain: "base",
      expectedAmount: 5,
      expectedRecipient: "0xreal",
    });

    expect(result).toBe(evmResult); // same reference, not copied
  });

  it("propagates verifier failure results unchanged", async () => {
    mockVerifySolana.mockResolvedValue({
      verified: false,
      error: "Amount insufficient",
      actualAmount: 100n,
    });

    const result = await verify({
      txHash: "sig",
      chain: "solana",
      expectedAmount: 10,
      expectedRecipient: "addr",
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBe("Amount insufficient");
  });

  it("returns error for unknown chain without calling any verifier", async () => {
    const result = await verify({
      txHash: "hash",
      chain: "polygon" as any,
      expectedAmount: 1,
      expectedRecipient: "addr",
    });

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Unsupported chain");
    expect(mockVerifyEvm).not.toHaveBeenCalled();
    expect(mockVerifySolana).not.toHaveBeenCalled();
    expect(mockVerifyIcp).not.toHaveBeenCalled();
  });
});
