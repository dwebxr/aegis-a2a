import { describe, it, expect } from "vitest";
import {
  usdcToUnits,
  isValidChain,
  VALID_CHAINS,
  USDC_ADDRESSES,
  USDC_DECIMALS,
  CHAIN_NAMES,
} from "@/lib/constants";

describe("usdcToUnits", () => {
  it("converts whole USDC amounts to 6-decimal units", () => {
    expect(usdcToUnits(1)).toBe(1_000_000n);
    expect(usdcToUnits(100)).toBe(100_000_000n);
    expect(usdcToUnits(0)).toBe(0n);
  });

  it("converts fractional USDC amounts correctly", () => {
    expect(usdcToUnits(0.5)).toBe(500_000n);
    expect(usdcToUnits(1.5)).toBe(1_500_000n);
    expect(usdcToUnits(0.000001)).toBe(1n); // minimum unit
    expect(usdcToUnits(0.01)).toBe(10_000n);
    expect(usdcToUnits(99.99)).toBe(99_990_000n);
  });

  it("rounds sub-unit amounts correctly via Math.round", () => {
    // 0.0000005 is exactly half a unit → rounds to 1
    expect(usdcToUnits(0.0000005)).toBe(1n);
    // 0.0000004 → rounds to 0
    expect(usdcToUnits(0.0000004)).toBe(0n);
  });

  it("handles large amounts", () => {
    expect(usdcToUnits(1_000_000)).toBe(1_000_000_000_000n);
  });
});

describe("usdcToUnits roundtrip", () => {
  it("preserves standard values when converted back", () => {
    const amounts = [0, 0.01, 0.5, 1, 10, 99.99, 1000];
    for (const amount of amounts) {
      const units = usdcToUnits(amount);
      const back = Number(units) / 10 ** USDC_DECIMALS;
      expect(back).toBeCloseTo(amount, 6);
    }
  });
});

describe("isValidChain", () => {
  it("returns true for valid chains", () => {
    expect(isValidChain("base")).toBe(true);
    expect(isValidChain("solana")).toBe(true);
    expect(isValidChain("icp")).toBe(true);
  });

  it("returns false for invalid chains", () => {
    expect(isValidChain("ethereum")).toBe(false);
    expect(isValidChain("")).toBe(false);
    expect(isValidChain("BASE")).toBe(false);
    expect(isValidChain("Solana")).toBe(false);
    expect(isValidChain("polygon")).toBe(false);
    expect(isValidChain("bitcoin")).toBe(false);
  });

  it("acts as a type guard", () => {
    const chain: string = "base";
    if (isValidChain(chain)) {
      // TypeScript now knows chain is ChainType
      const _: "base" | "solana" | "icp" = chain;
      expect(_).toBe("base");
    }
  });
});

describe("constants integrity", () => {
  it("VALID_CHAINS contains exactly the expected chains", () => {
    expect(VALID_CHAINS).toEqual(["base", "solana", "icp"]);
    expect(VALID_CHAINS).toHaveLength(3);
  });

  it("USDC_DECIMALS is 6", () => {
    expect(USDC_DECIMALS).toBe(6);
  });

  it("USDC_ADDRESSES has entries for all valid chains", () => {
    for (const chain of VALID_CHAINS) {
      expect(USDC_ADDRESSES[chain]).toBeDefined();
      expect(typeof USDC_ADDRESSES[chain]).toBe("string");
      expect(USDC_ADDRESSES[chain].length).toBeGreaterThan(0);
    }
  });

  it("CHAIN_NAMES has entries for all valid chains", () => {
    for (const chain of VALID_CHAINS) {
      expect(CHAIN_NAMES[chain]).toBeDefined();
      expect(typeof CHAIN_NAMES[chain]).toBe("string");
    }
  });

  it("Base USDC address is a valid EVM address", () => {
    expect(USDC_ADDRESSES.base).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
