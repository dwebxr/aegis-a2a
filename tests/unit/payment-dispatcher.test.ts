import { describe, it, expect, vi, beforeEach } from "vitest";
import { pay } from "@/services/payment/index";
import type { PaymentRequest, WalletContext } from "@/services/payment/types";

// Mock chain-specific functions but TRACK what they receive
const mockPayEvm = vi.fn();
const mockPaySolana = vi.fn();
const mockPayIcp = vi.fn();

vi.mock("@/services/payment/evm", () => ({
  payEvm: (...args: unknown[]) => mockPayEvm(...args),
}));
vi.mock("@/services/payment/solana", () => ({
  paySolana: (...args: unknown[]) => mockPaySolana(...args),
}));
vi.mock("@/services/payment/icp", () => ({
  payIcp: (...args: unknown[]) => mockPayIcp(...args),
}));

describe("payment dispatcher (pay)", () => {
  const baseReq: PaymentRequest = {
    offerId: "offer-1",
    chain: "base",
    amount: 10,
    recipient: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayEvm.mockResolvedValue({ txHash: "0xevm", chain: "base", confirmed: true });
    mockPaySolana.mockResolvedValue({ txHash: "sol-sig", chain: "solana", confirmed: true });
    mockPayIcp.mockResolvedValue({ txHash: "42", chain: "icp", confirmed: true });
  });

  describe("chain routing - verifies correct function called with correct args", () => {
    it("routes base to payEvm and passes walletClient", async () => {
      const fakeWallet = { getAddresses: vi.fn() };
      const ctx: WalletContext = { evmWalletClient: fakeWallet as any };
      const req = { ...baseReq, chain: "base" as const };

      await pay(req, ctx);

      expect(mockPayEvm).toHaveBeenCalledOnce();
      expect(mockPaySolana).not.toHaveBeenCalled();
      expect(mockPayIcp).not.toHaveBeenCalled();
      // Verify the ACTUAL request and wallet were forwarded
      expect(mockPayEvm).toHaveBeenCalledWith(req, fakeWallet);
    });

    it("routes solana to paySolana and passes wallet adapter", async () => {
      const fakeWallet = { publicKey: "pk", signTransaction: vi.fn() };
      const ctx: WalletContext = { solanaWallet: fakeWallet as any };
      const req = { ...baseReq, chain: "solana" as const };

      await pay(req, ctx);

      expect(mockPaySolana).toHaveBeenCalledOnce();
      expect(mockPayEvm).not.toHaveBeenCalled();
      expect(mockPayIcp).not.toHaveBeenCalled();
      // First arg should be the request
      expect(mockPaySolana.mock.calls[0][0]).toBe(req);
    });

    it("routes icp to payIcp WITHOUT requiring wallet context", async () => {
      const req = { ...baseReq, chain: "icp" as const };

      await pay(req, {});

      expect(mockPayIcp).toHaveBeenCalledOnce();
      expect(mockPayIcp).toHaveBeenCalledWith(req);
      expect(mockPayEvm).not.toHaveBeenCalled();
      expect(mockPaySolana).not.toHaveBeenCalled();
    });
  });

  describe("wallet not connected - fails BEFORE calling chain function", () => {
    it("returns error for base when evmWalletClient is missing", async () => {
      const result = await pay({ ...baseReq, chain: "base" }, {});

      expect(result.confirmed).toBe(false);
      expect(result.error).toBe("EVM wallet not connected");
      expect(result.txHash).toBe("");
      // CRITICAL: payEvm must NOT have been called
      expect(mockPayEvm).not.toHaveBeenCalled();
    });

    it("returns error for solana when solanaWallet is missing", async () => {
      const result = await pay({ ...baseReq, chain: "solana" }, {});

      expect(result.confirmed).toBe(false);
      expect(result.error).toBe("Solana wallet not connected");
      // CRITICAL: paySolana must NOT have been called
      expect(mockPaySolana).not.toHaveBeenCalled();
    });
  });

  describe("error propagation from chain functions", () => {
    it("propagates payEvm errors to caller", async () => {
      mockPayEvm.mockResolvedValue({
        txHash: "",
        chain: "base",
        confirmed: false,
        error: "User rejected transaction",
      });
      const ctx: WalletContext = { evmWalletClient: {} as any };

      const result = await pay({ ...baseReq, chain: "base" }, ctx);

      expect(result.confirmed).toBe(false);
      expect(result.error).toBe("User rejected transaction");
    });

    it("propagates payIcp errors to caller", async () => {
      mockPayIcp.mockResolvedValue({
        txHash: "",
        chain: "icp",
        confirmed: false,
        error: "Plug wallet not detected",
      });

      const result = await pay({ ...baseReq, chain: "icp" }, {});

      expect(result.confirmed).toBe(false);
      expect(result.error).toBe("Plug wallet not detected");
    });
  });

  describe("unsupported chain", () => {
    it("returns error without calling any chain function", async () => {
      const result = await pay(
        { ...baseReq, chain: "polygon" as any },
        {}
      );
      expect(result.confirmed).toBe(false);
      expect(result.error).toContain("Unsupported chain");
      expect(mockPayEvm).not.toHaveBeenCalled();
      expect(mockPaySolana).not.toHaveBeenCalled();
      expect(mockPayIcp).not.toHaveBeenCalled();
    });
  });
});
