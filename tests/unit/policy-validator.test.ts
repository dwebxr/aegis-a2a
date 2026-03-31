import { describe, it, expect } from "vitest";
import type { PolicyRule } from "@/types/policy";
import { validatePolicy } from "@/services/policy/validator";

describe("Policy Validator", () => {
  it("accepts valid rules", () => {
    const rules: PolicyRule[] = [
      { type: "vcl_threshold", params: { minComposite: 8 } },
      { type: "chain_restrict", params: { allowedChains: ["base"] } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects unknown rule type", () => {
    const rules = [{ type: "unknown_type" as any, params: {} }];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unknown rule type");
  });

  it("rejects vcl_threshold with no params", () => {
    const rules: PolicyRule[] = [{ type: "vcl_threshold", params: {} }];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects vcl_threshold with out-of-range value", () => {
    const rules: PolicyRule[] = [
      { type: "vcl_threshold", params: { minComposite: 15 } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects rate_limit with non-positive maxRequests", () => {
    const rules: PolicyRule[] = [
      { type: "rate_limit", params: { maxRequests: -1, windowMs: 60000 } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects chain_restrict with invalid chain", () => {
    const rules: PolicyRule[] = [
      { type: "chain_restrict", params: { allowedChains: ["ethereum"] } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects chain_restrict with empty array", () => {
    const rules: PolicyRule[] = [
      { type: "chain_restrict", params: { allowedChains: [] } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects price_cap with negative value", () => {
    const rules: PolicyRule[] = [
      { type: "price_cap", params: { maxUsdc: -5 } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects agent_allowlist with empty agentIds", () => {
    const rules: PolicyRule[] = [
      { type: "agent_allowlist", params: { agentIds: [] } },
    ];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  it("rejects topic_filter with no topics", () => {
    const rules: PolicyRule[] = [{ type: "topic_filter", params: {} }];
    const result = validatePolicy(rules);
    expect(result.valid).toBe(false);
  });

  describe("Contradiction Detection", () => {
    it("warns about conflicting chain restrictions", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base"] } },
        { type: "chain_restrict", params: { allowedChains: ["solana"] } },
      ];
      const result = validatePolicy(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("Contradiction"))).toBe(true);
    });

    it("warns about agent in both allowlist and blocklist", () => {
      const rules: PolicyRule[] = [
        { type: "agent_allowlist", params: { agentIds: ["hermes"] } },
        { type: "agent_blocklist", params: { agentIds: ["hermes"] } },
      ];
      const result = validatePolicy(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("hermes"))).toBe(true);
    });

    it("warns about topic in both required and excluded", () => {
      const rules: PolicyRule[] = [
        { type: "topic_filter", params: { requiredTopics: ["crypto"] } },
        { type: "topic_filter", params: { excludedTopics: ["crypto"] } },
      ];
      const result = validatePolicy(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("crypto"))).toBe(true);
    });

    it("no warning for non-conflicting rules", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base", "solana"] } },
        { type: "vcl_threshold", params: { minComposite: 7 } },
      ];
      const result = validatePolicy(rules);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
