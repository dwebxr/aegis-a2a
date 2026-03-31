import { describe, it, expect } from "vitest";
import { compilePolicyWithKeywords } from "@/services/policy/compiler";

describe("Policy Compiler — Keyword Fallback", () => {
  describe("VCL Threshold", () => {
    it('parses "VCL above 8"', () => {
      const rules = compilePolicyWithKeywords("VCL above 8");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("vcl_threshold");
      expect(rules[0]!.params.minComposite).toBe(8);
    });

    it('parses "VCL score >= 7.5"', () => {
      const rules = compilePolicyWithKeywords("VCL score >= 7.5");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.minComposite).toBe(7.5);
    });

    it('parses "minimum composite 9"', () => {
      const rules = compilePolicyWithKeywords("minimum composite 9");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.minComposite).toBe(9);
    });

    it('parses "quality at least 6"', () => {
      const rules = compilePolicyWithKeywords("quality at least 6");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.minComposite).toBe(6);
    });

    it('parses Japanese "VCLスコア8以上"', () => {
      const rules = compilePolicyWithKeywords("VCLスコア8以上");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.minComposite).toBe(8);
    });

    it('parses "品質スコア7.5以上"', () => {
      const rules = compilePolicyWithKeywords("品質スコア7.5以上");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.minComposite).toBe(7.5);
    });
  });

  describe("Chain Restrict", () => {
    it('parses "only Base"', () => {
      const rules = compilePolicyWithKeywords("only base");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("chain_restrict");
      expect(rules[0]!.params.allowedChains).toEqual(["base"]);
    });

    it('parses "restrict to Base and Solana"', () => {
      const rules = compilePolicyWithKeywords("restrict to base and solana");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.allowedChains).toEqual(["base", "solana"]);
    });

    it('parses "limit to base, solana, icp"', () => {
      const rules = compilePolicyWithKeywords("limit to base, solana, icp");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.allowedChains).toEqual(["base", "solana", "icp"]);
    });

    it('parses Japanese "Baseチェーンのみ"', () => {
      const rules = compilePolicyWithKeywords("Baseチェーンのみ");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.allowedChains).toEqual(["base"]);
    });

    it('parses Japanese "BaseとSolanaのみ"', () => {
      const rules = compilePolicyWithKeywords("BaseとSolanaのみ");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.allowedChains).toEqual(["base", "solana"]);
    });
  });

  describe("Rate Limit", () => {
    it('parses "max 10 requests per minute"', () => {
      const rules = compilePolicyWithKeywords("max 10 requests per minute");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("rate_limit");
      expect(rules[0]!.params.maxRequests).toBe(10);
      expect(rules[0]!.params.windowMs).toBe(60_000);
    });

    it('parses "limit 5 req/sec"', () => {
      const rules = compilePolicyWithKeywords("limit 5 req/sec");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.maxRequests).toBe(5);
      expect(rules[0]!.params.windowMs).toBe(1_000);
    });

    it('parses Japanese "1分10リクエストまで"', () => {
      const rules = compilePolicyWithKeywords("1分10リクエストまで");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.maxRequests).toBe(10);
      expect(rules[0]!.params.windowMs).toBe(60_000);
    });
  });

  describe("Price Cap", () => {
    it('parses "max price $50"', () => {
      const rules = compilePolicyWithKeywords("max price $50");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("price_cap");
      expect(rules[0]!.params.maxUsdc).toBe(50);
    });

    it('parses "price cap 100 USDC"', () => {
      const rules = compilePolicyWithKeywords("max price 100");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.params.maxUsdc).toBe(100);
    });
  });

  describe("Agent Lists", () => {
    it('parses "block agent badbot"', () => {
      const rules = compilePolicyWithKeywords("block agent badbot");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("agent_blocklist");
      expect(rules[0]!.params.agentIds).toEqual(["badbot"]);
    });

    it('parses "only allow agent hermes"', () => {
      const rules = compilePolicyWithKeywords("only allow agent hermes");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("agent_allowlist");
      expect(rules[0]!.params.agentIds).toEqual(["hermes"]);
    });
  });

  describe("Topic Filter", () => {
    it('parses "require topic crypto"', () => {
      const rules = compilePolicyWithKeywords("require topic crypto");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("topic_filter");
      expect(rules[0]!.params.requiredTopics).toEqual(["crypto"]);
    });

    it('parses "exclude topic politics"', () => {
      const rules = compilePolicyWithKeywords("exclude topic politics");
      expect(rules).toHaveLength(1);
      expect(rules[0]!.type).toBe("topic_filter");
      expect(rules[0]!.params.excludedTopics).toEqual(["politics"]);
    });
  });

  describe("Multiple Rules", () => {
    it("extracts multiple rules from a single input", () => {
      const rules = compilePolicyWithKeywords(
        "VCL above 8, only base, max 10 requests per minute",
      );
      expect(rules.length).toBeGreaterThanOrEqual(3);
      const types = rules.map((r) => r.type);
      expect(types).toContain("vcl_threshold");
      expect(types).toContain("chain_restrict");
      expect(types).toContain("rate_limit");
    });
  });

  describe("No Match", () => {
    it("returns empty array for unrecognized input", () => {
      const rules = compilePolicyWithKeywords("make everything awesome");
      expect(rules).toHaveLength(0);
    });
  });
});
