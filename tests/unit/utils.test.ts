import { describe, it, expect } from "vitest";
import {
  truncateAddress,
  generateId,
  formatUsdc,
  isValidEvmAddress,
  isValidSolanaAddress,
  getExplorerUrl,
} from "@/lib/utils";

describe("truncateAddress", () => {
  it("truncates long addresses with default chars", () => {
    const addr = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const result = truncateAddress(addr);
    expect(result).toBe("0x8335...2913");
    expect(result.length).toBeLessThan(addr.length);
  });

  it("truncates with custom char count", () => {
    const addr = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    expect(truncateAddress(addr, 6)).toBe("0x833589...A02913");
    expect(truncateAddress(addr, 2)).toBe("0x83...13");
  });

  it("returns short addresses unchanged", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
    expect(truncateAddress("abc")).toBe("abc");
    expect(truncateAddress("")).toBe("");
  });

  it("handles addresses exactly at boundary", () => {
    // chars=4 means length boundary is 4*2+2=10
    const exactly10 = "0x12345678"; // 10 chars
    expect(truncateAddress(exactly10, 4)).toBe("0x12345678"); // unchanged
    const eleven = "0x123456789"; // 11 chars
    expect(truncateAddress(eleven, 4)).toBe("0x1234...6789");
  });

  it("handles Solana base58 addresses", () => {
    const solAddr = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const result = truncateAddress(solAddr);
    expect(result).toContain("...");
    expect(result.startsWith("EPjFWd")).toBe(true);
    expect(result.endsWith("Dt1v")).toBe(true);
  });
});

describe("generateId", () => {
  it("returns a valid UUID v4", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("formatUsdc", () => {
  it("formats whole amounts", () => {
    expect(formatUsdc(1)).toBe("$1.00 USDC");
    expect(formatUsdc(100)).toBe("$100.00 USDC");
    expect(formatUsdc(0)).toBe("$0.00 USDC");
  });

  it("formats fractional amounts to 2 decimal places", () => {
    expect(formatUsdc(1.5)).toBe("$1.50 USDC");
    expect(formatUsdc(0.01)).toBe("$0.01 USDC");
    expect(formatUsdc(99.99)).toBe("$99.99 USDC");
  });

  it("truncates extra decimal places", () => {
    expect(formatUsdc(1.999)).toBe("$2.00 USDC");
    expect(formatUsdc(1.001)).toBe("$1.00 USDC");
    // 1.005 rounds to $1.00 due to floating point (1.005 is stored as 1.004999...)
    expect(formatUsdc(1.005)).toBe("$1.00 USDC");
  });

  it("handles large amounts", () => {
    expect(formatUsdc(1000000)).toBe("$1000000.00 USDC");
  });
});

describe("isValidEvmAddress", () => {
  it("accepts valid checksummed addresses", () => {
    expect(isValidEvmAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBe(true);
  });

  it("accepts valid lowercase addresses", () => {
    expect(isValidEvmAddress("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")).toBe(true);
  });

  it("accepts valid uppercase addresses", () => {
    expect(isValidEvmAddress("0x833589FCD6EDB6E08F4C7C32D4F71B54BDA02913")).toBe(true);
  });

  it("rejects addresses without 0x prefix", () => {
    expect(isValidEvmAddress("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBe(false);
  });

  it("rejects addresses with wrong length", () => {
    expect(isValidEvmAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA0291")).toBe(false); // 39 chars
    expect(isValidEvmAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA029133")).toBe(false); // 41 chars
  });

  it("rejects addresses with invalid characters", () => {
    expect(isValidEvmAddress("0xGGGG89fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBe(false);
    expect(isValidEvmAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA0291!")).toBe(false);
  });

  it("rejects empty and garbage input", () => {
    expect(isValidEvmAddress("")).toBe(false);
    expect(isValidEvmAddress("not an address")).toBe(false);
    expect(isValidEvmAddress("0x")).toBe(false);
  });
});

describe("isValidSolanaAddress", () => {
  it("accepts valid Solana addresses", () => {
    expect(isValidSolanaAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true);
    expect(isValidSolanaAddress("11111111111111111111111111111111")).toBe(true); // 32 chars
  });

  it("rejects addresses with invalid base58 characters", () => {
    // 0, O, I, l are not in base58
    expect(isValidSolanaAddress("0PjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(false);
    expect(isValidSolanaAddress("OPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(false);
    expect(isValidSolanaAddress("IPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(false);
    expect(isValidSolanaAddress("lPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(false);
  });

  it("rejects addresses that are too short or too long", () => {
    expect(isValidSolanaAddress("1234567890123456789012345678901")).toBe(false); // 31 chars
    expect(isValidSolanaAddress("123456789012345678901234567890123456789012345")).toBe(false); // 45 chars
  });

  it("rejects empty and garbage input", () => {
    expect(isValidSolanaAddress("")).toBe(false);
    expect(isValidSolanaAddress("not-an-address")).toBe(false);
  });
});

describe("getExplorerUrl", () => {
  const txHash = "0xabc123def456";

  it("returns BaseScan URL for base chain", () => {
    expect(getExplorerUrl(txHash, "base")).toBe(`https://basescan.org/tx/${txHash}`);
  });

  it("returns SolScan URL for solana chain", () => {
    expect(getExplorerUrl(txHash, "solana")).toBe(`https://solscan.io/tx/${txHash}`);
  });

  it("returns IC Dashboard URL for icp chain", () => {
    expect(getExplorerUrl(txHash, "icp")).toBe(
      `https://dashboard.internetcomputer.org/transaction/${txHash}`
    );
  });

  it("includes the full tx hash in URL", () => {
    const longHash = "0x" + "a".repeat(64);
    const url = getExplorerUrl(longHash, "base");
    expect(url).toContain(longHash);
  });
});
