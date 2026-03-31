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
    id: "offer-1",
    agentId: "hermes",
    title: "Test",
    description: "test",
    priceUsdc: 5,
    supportedChains: ["base", "solana"] as ChainType[],
    topics: ["crypto", "defi"],
    vclScores: {
      originality: 8,
      insight: 7,
      credibility: 9,
      composite: 8,
      verdict: "quality",
    } as VCLScores,
    ...overrides,
  };
}

describe("Policy Enforcer", () => {
  describe("VCL Threshold", () => {
    it("passes when composite meets threshold", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 7 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects when composite is below threshold", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 9 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain("composite 8 below");
    });

    it("rejects when VCL scores are missing", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 5 } },
      ];
      const result = enforcePolicy(makeOffer({ vclScores: undefined }), rules);
      expect(result.allowed).toBe(false);
    });

    it("checks individual score fields", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minOriginality: 9 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain("originality 8");
    });
  });

  describe("Chain Restrict", () => {
    it("passes when all chains are allowed", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base", "solana"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects when chain is not allowed", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["icp"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain("not allowed");
    });
  });

  describe("Price Cap", () => {
    it("passes within cap", () => {
      const rules: PolicyRule[] = [
        { type: "price_cap", params: { maxUsdc: 10 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects over cap", () => {
      const rules: PolicyRule[] = [
        { type: "price_cap", params: { maxUsdc: 2 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain("exceeds");
    });
  });

  describe("Agent Allowlist", () => {
    it("passes for allowed agent", () => {
      const rules: PolicyRule[] = [
        { type: "agent_allowlist", params: { agentIds: ["hermes", "milady"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects for non-allowed agent", () => {
      const rules: PolicyRule[] = [
        { type: "agent_allowlist", params: { agentIds: ["milady"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Agent Blocklist", () => {
    it("passes for non-blocked agent", () => {
      const rules: PolicyRule[] = [
        { type: "agent_blocklist", params: { agentIds: ["badbot"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects blocked agent", () => {
      const rules: PolicyRule[] = [
        { type: "agent_blocklist", params: { agentIds: ["hermes"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Topic Filter", () => {
    it("passes when required topics exist", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { requiredTopics: ["crypto"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("rejects when required topics are missing", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { requiredTopics: ["biology"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
    });

    it("rejects when excluded topics are present", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { excludedTopics: ["defi"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
    });

    it("passes when excluded topics are absent", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { excludedTopics: ["politics"] } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Multiple Rules", () => {
    it("all pass → allowed", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 7 } },
        { type: "chain_restrict", params: { allowedChains: ["base", "solana"] } },
        { type: "price_cap", params: { maxUsdc: 10 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(true);
    });

    it("any fail → rejected with all violations", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 9 } },
        { type: "price_cap", params: { maxUsdc: 2 } },
      ];
      const result = enforcePolicy(makeOffer(), rules);
      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe("extractRateLimit", () => {
    it("returns null when no rate_limit rules", () => {
      const rules: PolicyRule[] = [
        { type: "vcl_threshold", params: { minComposite: 7 } },
      ];
      expect(extractRateLimit(rules)).toBeNull();
    });

    it("extracts single rate limit", () => {
      const rules: PolicyRule[] = [
        { type: "rate_limit", params: { maxRequests: 10, windowMs: 60000 } },
      ];
      const result = extractRateLimit(rules);
      expect(result).toEqual({ maxRequests: 10, windowMs: 60000 });
    });

    it("selects most restrictive rate limit", () => {
      const rules: PolicyRule[] = [
        { type: "rate_limit", params: { maxRequests: 60, windowMs: 60000 } }, // 1/s
        { type: "rate_limit", params: { maxRequests: 5, windowMs: 60000 } },  // 0.08/s
      ];
      const result = extractRateLimit(rules);
      expect(result!.maxRequests).toBe(5);
    });
  });

  describe("parsePolicyHeader", () => {
    it("parses valid JSON header", () => {
      const rules = parsePolicyHeader(
        JSON.stringify([{ type: "vcl_threshold", params: { minComposite: 8 } }]),
      );
      expect(rules).toHaveLength(1);
    });

    it("returns empty for null header", () => {
      expect(parsePolicyHeader(null)).toEqual([]);
    });

    it("returns empty for invalid JSON", () => {
      expect(parsePolicyHeader("not json")).toEqual([]);
    });

    it("returns empty for non-array JSON", () => {
      expect(parsePolicyHeader('{"type": "test"}')).toEqual([]);
    });
  });
});
