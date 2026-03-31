export type PolicyRuleType =
  | "vcl_threshold"
  | "rate_limit"
  | "chain_restrict"
  | "price_cap"
  | "agent_allowlist"
  | "agent_blocklist"
  | "topic_filter";

export interface PolicyRule {
  type: PolicyRuleType;
  params: Record<string, unknown>;
}

export interface PolicyDocument {
  id: string;
  name: string;
  naturalLanguage: string;
  rules: PolicyRule[];
  compiledAt: number;
  version: number;
}

export const VALID_RULE_TYPES: readonly PolicyRuleType[] = [
  "vcl_threshold",
  "rate_limit",
  "chain_restrict",
  "price_cap",
  "agent_allowlist",
  "agent_blocklist",
  "topic_filter",
];
