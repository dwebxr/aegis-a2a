import { describe, it, expect, vi, beforeEach } from "vitest";
import { isRateLimited } from "@/lib/rate-limit";

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests under the limit", () => {
    const key = `test-under-${Date.now()}`;
    for (let i = 0; i < 59; i++) {
      expect(isRateLimited(key)).toBe(false);
    }
  });

  it("blocks the 61st request in a window", () => {
    const key = `test-block-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      expect(isRateLimited(key)).toBe(false);
    }
    expect(isRateLimited(key)).toBe(true);
  });

  it("isolates different keys", () => {
    const keyA = `test-a-${Date.now()}`;
    const keyB = `test-b-${Date.now()}`;

    for (let i = 0; i < 60; i++) {
      isRateLimited(keyA);
    }

    expect(isRateLimited(keyA)).toBe(true);
    expect(isRateLimited(keyB)).toBe(false);
  });

  it("allows requests after the window expires", () => {
    const key = `test-expire-${Date.now()}`;
    const realNow = Date.now;

    let currentTime = 1000000;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);

    for (let i = 0; i < 60; i++) {
      isRateLimited(key);
    }
    expect(isRateLimited(key)).toBe(true);

    // Advance time past the 1-minute window
    currentTime += 61_000;

    expect(isRateLimited(key)).toBe(false);

    Date.now = realNow;
  });

  it("prunes old entries from the sliding window", () => {
    const key = `test-prune-${Date.now()}`;
    const realNow = Date.now;

    let currentTime = 1000000;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);

    // Fill up 30 requests
    for (let i = 0; i < 30; i++) {
      isRateLimited(key);
    }

    // Advance time by 30 seconds
    currentTime += 30_000;

    // Add 30 more
    for (let i = 0; i < 30; i++) {
      isRateLimited(key);
    }

    // Advance past the window for the first 30
    currentTime += 31_000;

    // The first 30 should be pruned, so we should have capacity again
    expect(isRateLimited(key)).toBe(false);

    Date.now = realNow;
  });
});
