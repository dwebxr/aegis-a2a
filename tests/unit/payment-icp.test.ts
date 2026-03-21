import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { payIcp } from "@/services/payment/icp";
import type { PaymentRequest } from "@/services/payment/types";

// We need to simulate the browser window.ic.plug global
const originalWindow = globalThis.window;

function setupPlugMock(overrides: Partial<typeof window.ic.plug> = {}) {
  (globalThis as any).window = {
    ic: {
      plug: {
        isConnected: vi.fn().mockResolvedValue(true),
        requestConnect: vi.fn().mockResolvedValue(true),
        createActor: vi.fn().mockResolvedValue({
          icrc1_transfer: vi.fn().mockResolvedValue({ Ok: 42n }),
        }),
        principalId: "test-principal",
        accountId: "test-account",
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  setupPlugMock();
});

afterEach(() => {
  (globalThis as any).window = originalWindow;
});

describe("payIcp", () => {
  const req: PaymentRequest = {
    offerId: "o1",
    chain: "icp",
    amount: 5,
    recipient: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  };

  it("returns error when Plug wallet is not installed", async () => {
    (globalThis as any).window = { ic: undefined };
    const result = await payIcp(req);
    expect(result.confirmed).toBe(false);
    expect(result.error).toContain("Plug wallet not detected");
  });

  it("returns error when window.ic.plug is undefined", async () => {
    (globalThis as any).window = { ic: {} };
    const result = await payIcp(req);
    expect(result.confirmed).toBe(false);
    expect(result.error).toContain("Plug wallet not detected");
  });

  it("connects if not already connected", async () => {
    const requestConnect = vi.fn().mockResolvedValue(true);
    setupPlugMock({
      isConnected: vi.fn().mockResolvedValue(false),
      requestConnect,
    });

    await payIcp(req);
    expect(requestConnect).toHaveBeenCalled();
  });

  it("skips connect if already connected", async () => {
    const requestConnect = vi.fn();
    setupPlugMock({
      isConnected: vi.fn().mockResolvedValue(true),
      requestConnect,
    });

    await payIcp(req);
    expect(requestConnect).not.toHaveBeenCalled();
  });

  it("returns txHash on successful transfer (Ok variant)", async () => {
    setupPlugMock({
      createActor: vi.fn().mockResolvedValue({
        icrc1_transfer: vi.fn().mockResolvedValue({ Ok: 999n }),
      }),
    });

    const result = await payIcp(req);
    expect(result.confirmed).toBe(true);
    expect(result.txHash).toBe("999");
    expect(result.chain).toBe("icp");
  });

  it("returns error on failed transfer (Err variant)", async () => {
    setupPlugMock({
      createActor: vi.fn().mockResolvedValue({
        icrc1_transfer: vi.fn().mockResolvedValue({
          Err: { InsufficientFunds: { balance: "0" } },
        }),
      }),
    });

    const result = await payIcp(req);
    expect(result.confirmed).toBe(false);
    expect(result.error).toContain("ICP transfer error");
    expect(result.error).toContain("InsufficientFunds");
  });

  it("handles actor creation failure", async () => {
    setupPlugMock({
      createActor: vi.fn().mockRejectedValue(new Error("Actor creation failed")),
    });

    const result = await payIcp(req);
    expect(result.confirmed).toBe(false);
    expect(result.error).toBe("Actor creation failed");
  });
});
