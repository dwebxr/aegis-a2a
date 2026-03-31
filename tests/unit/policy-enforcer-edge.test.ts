import { describe, it, expect } from "vitest";
import type { PolicyRule } from "@/types/policy";
import type { Offer, ChainType, VCLScores } from "@/types/offer";
import {
  enforcePolicy,
  extractRateLimit,
  parsePolicyHeader,
} from "@/services/policy/enforcer";

function makeOffer(overrides: Partial<Offer> = {}): Partial<Offer> {
  return {
    agentId: "hermes",
    priceUsdc: 5,
    supportedChains: ["base"] as ChainType[],
    topics: ["crypto"],
    vclScores: {
      originality: 8,
      insight: 8,
      credibility: 8,
      composite: 8,
      verdict: "quality",
    } as VCLScores,
    ...overrides,
  };
}

describe("Policy Enforcer — Edge Cases", () => {
  describe("VCL Threshold — Boundary Values", () => {
    it("passes when composite equals exact threshold", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 8 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects when composite is 0.01 below threshold", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 8.01 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
    });

    it("checks multiple VCL dimensions simultaneously", () => {
      const rules: PolicyRule[] = [
        {
          type: "vcl_threshold",
          params: { minComposite: 7, minOriginality: 9, minInsight: 7 },
        },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain("originality");
    });
  });

  describe("Chain Restrict — Edge Cases", () => {
    it("allows offer with subset of allowed chains", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base", "solana", "icp"] } },
      ];
      const result = enforcePolicy(makeOffer({ supportedChains: ["base"] }), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects multi-chain offer when one chain is disallowed", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base"] } },
      ];
      const result = enforcePolicy(
        makeOffer({ supportedChains: ["base", "solana"] as ChainType[] }),
        rules,
      );
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain("solana");
    });

    it("skips chain check when offer has no chains", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base"] } },
      ];
      const result = enforcePolicy({ agentId: "test" }, rules);
      expect(result.allowed).toBe(true); // no chains to check
    });
  });

  describe("Price Cap — Boundary", () => {
    it("passes at exact cap", () => {
      const rules: PolicyRule[] = [{ type: "price_cap", params: { maxUsdc: 5 } }];
      const result = enforcePolicy(makeOffer({ priceUsdc: 5 }), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects $0.01 over cap", () => {
      const rules: PolicyRule[] = [{ type: "price_cap", params: { maxUsdc: 5 } }];
      const result = enforcePolicy(makeOffer({ priceUsdc: 5.01 }), rules);
      expect(result.allowed).toBe(false);
    });

    it("passes free offer against any cap", () => {
      const rules: PolicyRule[] = [{ type: "price_cap", params: { maxUsdc: 0 } }];
      const result = enforcePolicy(makeOffer({ priceUsdc: 0 }), rules);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Topic Filter — Case Sensitivity", () => {
    it("matches topics case-insensitively", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { requiredTopics: ["CRYPTO"] } },
      ];
      const result = enforcePolicy(makeOffer({ topics: ["crypto"] }), rules);
      expect(result.allowed).toBe(true);
    });

    it("matches partial topic names", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { requiredTopics: ["crypt"] } },
      ];
      const result = enforcePolicy(makeOffer({ topics: ["cryptocurrency"] }), rules);
      expect(result.allowed).toBe(true);
    });

    it("excludes partial topic matches", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { excludedTopics: ["politic"] } },
      ];
      const result = enforcePolicy(makeOffer({ topics: ["politics"] }), rules);
      expect(result.allowed).toBe(false);
    });

    it("handles offer with no topics against required filter", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { requiredTopics: ["crypto"] } },
      ];
      const result = enforcePolicy(makeOffer({ topics: undefined }), rules);
      expect(result.allowed).toBe(false);
    });

    it("passes offer with no topics against excluded filter", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { excludedTopics: ["crypto"] } },
      ];
      const result = enforcePolicy(makeOffer({ topics: undefined }), rules);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Multiple Conflicting Rules", () => {
    it("collects ALL violations not just first", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 10 } },
        { type: "price_cap", params: { maxUsdc: 1 } },
        { type: "chain_restrict", params: { allowedChains: ["icp"] } },
        { type: "agent_blocklist", params: { agentIds: ["hermes"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBe(4);
    });

    it("empty rules array always allows", () => {
      const result = enforcePolicy(makeOffer(), []);
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("Rate Limit Extraction", () => {
    it("selects most restrictive from three limits", () => {
      const rules: PolicyRule[] = [
        { type: "rate_limit", params: { maxRequests: 100, windowMs: 60000 } },
        { type: "rate_limit", params: { maxRequests: 5, windowMs: 1000 } },
        { type: "rate_limit", params: { maxRequests: 10, windowMs: 60000 } },
      ];
      const rl = extractRateLimit(rules);
      // 100/60000=0.0017, 5/1000=0.005, 10/60000=0.00017
      expect(rl!.maxRequests).toBe(10);
      expect(rl!.windowMs).toBe(60000);
    });
  });

  describe("parsePolicyHeader — Robustness", () => {
    it("handles deeply nested JSON", () => {
      const nested = JSON.stringify([
        {
          type: "vcl_threshold",
          params: { minComposite: 7, nested: { deep: { value: true } } },
        },
      ]);
      const rules = parsePolicyHeader(nested);
      expect(rules).toHaveLength(1);
    });

    it("handles empty array", () => {
      expect(parsePolicyHeader("[]")).toEqual([]);
    });

    it("handles whitespace-only string", () => {
      expect(parsePolicyHeader("   ")).toEqual([]);
    });

    it("handles number JSON", () => {
      expect(parsePolicyHeader("42")).toEqual([]);
    });
  });
});
