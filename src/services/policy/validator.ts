import type { PolicyRule, PolicyDocument } from "@/types/policy";
import { VALID_RULE_TYPES } from "@/types/policy";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_CHAINS = new Set(["base", "solana", "icp"]);

function validateRule(rule: PolicyRule, index: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prefix = `Rule[${index}]`;

  if (!VALID_RULE_TYPES.includes(rule.type)) {
    errors.push(`${prefix}: Unknown rule type "${rule.type}"`);
    return { errors, warnings };
  }

  if (!rule.params || typeof rule.params !== "object") {
    errors.push(`${prefix}: params must be an object`);
    return { errors, warnings };
  }

  switch (rule.type) {
    case "vcl_threshold": {
      const fields = ["minComposite", "minOriginality", "minInsight", "minCredibility"] as const;
      let hasAny = false;
      for (const f of fields) {
        const v = rule.params[f];
        if (v !== undefined) {
          hasAny = true;
          if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10) {
            errors.push(`${prefix}: ${f} must be a number between 0 and 10`);
          }
        }
      }
      if (!hasAny) {
        errors.push(`${prefix}: vcl_threshold requires at least one threshold param`);
      }
      break;
    }

    case "rate_limit": {
      const { maxRequests, windowMs } = rule.params as Record<string, unknown>;
      if (typeof maxRequests !== "number" || maxRequests <= 0) {
        errors.push(`${prefix}: maxRequests must be a positive number`);
      }
      if (typeof windowMs !== "number" || windowMs <= 0) {
        errors.push(`${prefix}: windowMs must be a positive number`);
      }
      if (typeof maxRequests === "number" && maxRequests > 10_000) {
        warnings.push(`${prefix}: maxRequests ${maxRequests} is very high`);
      }
      break;
    }

    case "chain_restrict": {
      const { allowedChains } = rule.params as Record<string, unknown>;
      if (!Array.isArray(allowedChains) || allowedChains.length === 0) {
        errors.push(`${prefix}: allowedChains must be a non-empty array`);
      } else {
        for (const c of allowedChains) {
          if (!VALID_CHAINS.has(c as string)) {
            errors.push(`${prefix}: invalid chain "${c}". Must be one of: base, solana, icp`);
          }
        }
      }
      break;
    }

    case "price_cap": {
      const { maxUsdc } = rule.params as Record<string, unknown>;
      if (typeof maxUsdc !== "number" || maxUsdc < 0) {
        errors.push(`${prefix}: maxUsdc must be a non-negative number`);
      }
      break;
    }

    case "agent_allowlist":
    case "agent_blocklist": {
      const { agentIds } = rule.params as Record<string, unknown>;
      if (!Array.isArray(agentIds) || agentIds.length === 0) {
        errors.push(`${prefix}: agentIds must be a non-empty array`);
      }
      break;
    }

    case "topic_filter": {
      const { requiredTopics, excludedTopics } = rule.params as Record<string, unknown>;
      const hasRequired = Array.isArray(requiredTopics) && requiredTopics.length > 0;
      const hasExcluded = Array.isArray(excludedTopics) && excludedTopics.length > 0;
      if (!hasRequired && !hasExcluded) {
        errors.push(`${prefix}: topic_filter requires at least requiredTopics or excludedTopics`);
      }
      break;
    }
  }

  return { errors, warnings };
}

/**
 * Detect contradictions between rules in a policy.
 */
function detectContradictions(rules: PolicyRule[]): string[] {
  const warnings: string[] = [];

  // Check for conflicting chain restrictions
  const chainRestricts = rules.filter((r) => r.type === "chain_restrict");
  if (chainRestricts.length > 1) {
    const sets = chainRestricts.map((r) => new Set(r.params.allowedChains as string[]));
    const intersection = Array.from(sets[0]!).filter((c) => sets.every((s) => s.has(c)));
    if (intersection.length === 0) {
      warnings.push("Contradiction: multiple chain_restrict rules with no overlapping chains — no chain would be allowed");
    }
  }

  // Check for conflicting allowlist/blocklist
  const allowIds = new Set(
    rules.filter((r) => r.type === "agent_allowlist").flatMap((r) => r.params.agentIds as string[]),
  );
  const blockIds = new Set(
    rules.filter((r) => r.type === "agent_blocklist").flatMap((r) => r.params.agentIds as string[]),
  );
  const overlap = Array.from(allowIds).filter((id) => blockIds.has(id));
  if (overlap.length > 0) {
    warnings.push(`Contradiction: agents [${overlap.join(", ")}] appear in both allowlist and blocklist`);
  }

  // Check for conflicting topic filters
  const requiredTopics = new Set(
    rules.filter((r) => r.type === "topic_filter").flatMap((r) => (r.params.requiredTopics as string[] | undefined) || []),
  );
  const excludedTopics = new Set(
    rules.filter((r) => r.type === "topic_filter").flatMap((r) => (r.params.excludedTopics as string[] | undefined) || []),
  );
  const topicOverlap = Array.from(requiredTopics).filter((t) => excludedTopics.has(t));
  if (topicOverlap.length > 0) {
    warnings.push(`Contradiction: topics [${topicOverlap.join(", ")}] are both required and excluded`);
  }

  return warnings;
}

export function validatePolicy(rules: PolicyRule[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(rules)) {
    return { valid: false, errors: ["Policy rules must be an array"], warnings: [] };
  }

  for (let i = 0; i < rules.length; i++) {
    const result = validateRule(rules[i]!, i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (errors.length === 0) {
    warnings.push(...detectContradictions(rules));
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validatePolicyDocument(doc: PolicyDocument): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!doc.id || typeof doc.id !== "string") {
    errors.push("PolicyDocument requires a valid id");
  }
  if (!doc.name || typeof doc.name !== "string") {
    errors.push("PolicyDocument requires a name");
  }
  if (!doc.naturalLanguage || typeof doc.naturalLanguage !== "string") {
    errors.push("PolicyDocument requires naturalLanguage input");
  }

  const rulesResult = validatePolicy(doc.rules);
  errors.push(...rulesResult.errors);
  warnings.push(...rulesResult.warnings);

  return { valid: errors.length === 0, errors, warnings };
}
