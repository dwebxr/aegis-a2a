import { describe, it, expect } from "vitest";
import type { PolicyRule } from "@/types/policy";
import { validatePolicy, validatePolicyDocument } from "@/services/policy/validator";

describe("Policy Validator — Extended Edge Cases", () => {
  describe("vcl_threshold validation", () => {
    it("accepts all four fields", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: { minComposite: 7, minOriginality: 6, minInsight: 5, minCredibility: 8 },
      }];
      expect(validatePolicy(rules).valid).toBe(true);
    });

    it("rejects score of exactly 0 (valid boundary)", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: { minComposite: 0 },
      }];
      expect(validatePolicy(rules).valid).toBe(true);
    });

    it("rejects score of exactly 10 (valid boundary)", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: { minComposite: 10 },
      }];
      expect(validatePolicy(rules).valid).toBe(true);
    });

    it("rejects score of 10.1", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: { minComposite: 10.1 },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });

    it("rejects NaN score", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: { minComposite: NaN },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });

    it("rejects string score", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: { minComposite: "high" as any },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });
  });

  describe("rate_limit validation", () => {
    it("warns for very high maxRequests", () => {
      const rules: PolicyRule[] = [{
        type: "rate_limit",
        params: { maxRequests: 50000, windowMs: 60000 },
      }];
      const result = validatePolicy(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("very high"))).toBe(true);
    });

    it("rejects zero maxRequests", () => {
      const rules: PolicyRule[] = [{
        type: "rate_limit",
        params: { maxRequests: 0, windowMs: 60000 },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });

    it("rejects zero windowMs", () => {
      const rules: PolicyRule[] = [{
        type: "rate_limit",
        params: { maxRequests: 10, windowMs: 0 },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });

    it("rejects missing windowMs", () => {
      const rules: PolicyRule[] = [{
        type: "rate_limit",
        params: { maxRequests: 10 },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });
  });

  describe("Contradiction detection — Complex scenarios", () => {
    it("no warning when chain_restrict sets overlap", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base", "solana"] } },
        { type: "chain_restrict", params: { allowedChains: ["solana", "icp"] } },
      ];
      const result = validatePolicy(rules);
      expect(result.warnings.filter((w) => w.includes("Contradiction"))).toHaveLength(0);
    });

    it("warns when three chain_restrict rules have no common chain", () => {
      const rules: PolicyRule[] = [
        { type: "chain_restrict", params: { allowedChains: ["base"] } },
        { type: "chain_restrict", params: { allowedChains: ["solana"] } },
        { type: "chain_restrict", params: { allowedChains: ["icp"] } },
      ];
      const result = validatePolicy(rules);
      expect(result.warnings.some((w) => w.includes("Contradiction"))).toBe(true);
    });

    it("detects multiple agent overlap", () => {
      const rules: PolicyRule[] = [
        { type: "agent_allowlist", params: { agentIds: ["a", "b", "c"] } },
        { type: "agent_blocklist", params: { agentIds: ["b", "c", "d"] } },
      ];
      const result = validatePolicy(rules);
      expect(result.warnings.some((w) => w.includes("b") && w.includes("c"))).toBe(true);
    });
  });

  describe("validatePolicyDocument", () => {
    it("validates complete document", () => {
      const result = validatePolicyDocument({
        id: "doc-1",
        name: "My Policy",
        naturalLanguage: "VCL above 8",
        rules: [{ type: "vcl_threshold", params: { minComposite: 8 } }],
        compiledAt: Date.now(),
        version: 1,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects document with empty id", () => {
      const result = validatePolicyDocument({
        id: "",
        name: "Test",
        naturalLanguage: "test",
        rules: [],
        compiledAt: Date.now(),
        version: 1,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects document with empty name", () => {
      const result = validatePolicyDocument({
        id: "doc-1",
        name: "",
        naturalLanguage: "test",
        rules: [],
        compiledAt: Date.now(),
        version: 1,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects document with empty naturalLanguage", () => {
      const result = validatePolicyDocument({
        id: "doc-1",
        name: "Test",
        naturalLanguage: "",
        rules: [],
        compiledAt: Date.now(),
        version: 1,
      });
      expect(result.valid).toBe(false);
    });

    it("propagates rule validation errors into document result", () => {
      const result = validatePolicyDocument({
        id: "doc-1",
        name: "Test",
        naturalLanguage: "test",
        rules: [{ type: "unknown" as any, params: {} }],
        compiledAt: Date.now(),
        version: 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Unknown rule type"))).toBe(true);
    });
  });

  describe("Invalid inputs", () => {
    it("rejects null params", () => {
      const rules: PolicyRule[] = [{
        type: "vcl_threshold",
        params: null as any,
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });

    it("rejects non-array input", () => {
      const result = validatePolicy("not an array" as any);
      expect(result.valid).toBe(false);
    });

    it("rejects topic_filter with empty arrays", () => {
      const rules: PolicyRule[] = [{
        type: "topic_filter",
        params: { requiredTopics: [], excludedTopics: [] },
      }];
      expect(validatePolicy(rules).valid).toBe(false);
    });
  });
});
