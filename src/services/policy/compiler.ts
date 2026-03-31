import type { PolicyRule, PolicyRuleType } from "@/types/policy";
import { VALID_RULE_TYPES } from "@/types/policy";

const COMPILATION_PROMPT = `You are a security policy parser for an AI agent marketplace. Convert the natural language policy into a JSON array of rules.

Supported rule types and their params:
- vcl_threshold: { minComposite?, minOriginality?, minInsight?, minCredibility? } (values 0-10)
- rate_limit: { maxRequests, windowMs } (windowMs in milliseconds)
- chain_restrict: { allowedChains[] } (values: "base", "solana", "icp")
- price_cap: { maxUsdc } (max price in USDC)
- agent_allowlist: { agentIds[] } (only allow these agents)
- agent_blocklist: { agentIds[] } (block these agents)
- topic_filter: { requiredTopics?[], excludedTopics?[] }

Input: "{input}"

Respond ONLY with a JSON array of rule objects. Each must have "type" and "params". No other text.`;

// Client-side only — uses generateCompletion from the LLM engine
export async function compilePolicyWithLLM(input: string): Promise<PolicyRule[]> {
  const { generateCompletion } = await import("@/services/preference/llm-engine");
  const prompt = COMPILATION_PROMPT.replace("{input}", input.replace(/"/g, '\\"'));
  const raw = await generateCompletion(prompt);

  // Extract JSON from response (handle markdown code fences)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("LLM response did not contain a valid JSON array");
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown[];
  if (!Array.isArray(parsed)) {
    throw new Error("Parsed result is not an array");
  }

  return parsed
    .filter((item): item is { type: string; params: Record<string, unknown> } =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      "params" in item &&
      VALID_RULE_TYPES.includes((item as { type: string }).type as PolicyRuleType),
    )
    .map((item) => ({
      type: item.type as PolicyRuleType,
      params: item.params as Record<string, unknown>,
    }));
}

// ── Keyword-based fallback compiler (no LLM required) ──

const KEYWORD_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => PolicyRule;
}> = [
  // "VCL above 8", "VCL score >= 7.5", "minimum composite 8"
  {
    pattern: /(?:vcl|composite|quality)\s*(?:score\s*)?(?:above|>=?|at\s+least|minimum|min)\s*(\d+(?:\.\d+)?)|(?:minimum|min)\s+(?:vcl|composite|quality)\s*(?:score\s*)?\s*(\d+(?:\.\d+)?)/i,
    extract: (m) => ({
      type: "vcl_threshold",
      params: { minComposite: parseFloat(m[1] || m[2]!) },
    }),
  },
  // "VCLスコア8以上"
  {
    pattern: /(?:vcl|VCL|品質)\s*(?:スコア)?\s*(\d+(?:\.\d+)?)\s*以上/,
    extract: (m) => ({
      type: "vcl_threshold",
      params: { minComposite: parseFloat(m[1]!) },
    }),
  },
  // "only Base", "Base chain only", "restrict to Base and Solana"
  {
    pattern: /(?:only|restrict\s+to|limit\s+to|allowed?\s+chains?)\s*:?\s*((?:base|solana|icp)(?:\s*(?:,|and|&)\s*(?:base|solana|icp))*)/i,
    extract: (m) => ({
      type: "chain_restrict",
      params: {
        allowedChains: m[1]!.split(/\s*(?:,|and|&)\s*/i).map((c) => c.toLowerCase().trim()),
      },
    }),
  },
  // "Baseチェーンのみ", "BaseとSolanaのみ"
  {
    pattern: /((?:base|solana|icp)(?:\s*(?:と|、)\s*(?:base|solana|icp))*)\s*(?:チェーン)?\s*(?:のみ|だけ|限定)/i,
    extract: (m) => ({
      type: "chain_restrict",
      params: {
        allowedChains: m[1]!.split(/\s*(?:と|、)\s*/i).map((c) => c.toLowerCase().trim()),
      },
    }),
  },
  // "max 10 requests per minute", "limit 5 requests/min"
  {
    pattern: /(?:max|limit|up\s+to)\s*(\d+)\s*(?:requests?|req)\s*(?:per|\/)\s*(?:min(?:ute)?|sec(?:ond)?|hour)/i,
    extract: (m) => {
      const max = parseInt(m[1]!, 10);
      const unit = m[0]!.match(/sec|min|hour/i)?.[0]?.toLowerCase() || "min";
      const windowMs = unit.startsWith("sec") ? 1_000 : unit.startsWith("hour") ? 3_600_000 : 60_000;
      return { type: "rate_limit", params: { maxRequests: max, windowMs } };
    },
  },
  // "1分10リクエストまで"
  {
    pattern: /(\d+)\s*分\s*(\d+)\s*(?:リクエスト|回)\s*(?:まで|以下)/,
    extract: (m) => ({
      type: "rate_limit",
      params: {
        maxRequests: parseInt(m[2]!, 10),
        windowMs: parseInt(m[1]!, 10) * 60_000,
      },
    }),
  },
  // "max price $50", "price cap 100 USDC" — requires "price", "$" or "usdc" to avoid matching rate limits
  {
    pattern: /(?:(?:max|maximum|cap|limit)\s+price\s*\$?\s*(\d+(?:\.\d+)?)|(?:price\s+)?(?:cap|max)\s+\$(\d+(?:\.\d+)?)|(?:max|cap)\s*\$(\d+(?:\.\d+)?)\s*usdc|(\d+(?:\.\d+)?)\s*usdc\s*(?:max|cap|limit))/i,
    extract: (m) => ({
      type: "price_cap",
      params: { maxUsdc: parseFloat(m[1] || m[2] || m[3] || m[4]!) },
    }),
  },
  // "block agent xyz", "blocklist hermes"
  {
    pattern: /(?:block|blocklist|ban)\s+(?:agent\s+)?(\S+(?:\s*,\s*\S+)*)/i,
    extract: (m) => ({
      type: "agent_blocklist",
      params: { agentIds: m[1]!.split(/\s*,\s*/) },
    }),
  },
  // "only allow agent hermes", "allowlist hermes, milady"
  {
    pattern: /(?:only\s+)?(?:allow|allowlist|whitelist)\s+(?:agent\s+)?(\S+(?:\s*,\s*\S+)*)/i,
    extract: (m) => ({
      type: "agent_allowlist",
      params: { agentIds: m[1]!.split(/\s*,\s*/) },
    }),
  },
  // "require topic crypto", "exclude topic politics"
  {
    pattern: /(?:require|include)\s+(?:topic\s+)?(\S+(?:\s*,\s*\S+)*)/i,
    extract: (m) => ({
      type: "topic_filter",
      params: { requiredTopics: m[1]!.split(/\s*,\s*/) },
    }),
  },
  {
    pattern: /(?:exclude|filter\s+out|no)\s+(?:topic\s+)?(\S+(?:\s*,\s*\S+)*)/i,
    extract: (m) => ({
      type: "topic_filter",
      params: { excludedTopics: m[1]!.split(/\s*,\s*/) },
    }),
  },
];

// Fallback: extracts rules from regex patterns when LLM is unavailable
export function compilePolicyWithKeywords(input: string): PolicyRule[] {
  const rules: PolicyRule[] = [];

  for (const { pattern, extract } of KEYWORD_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      rules.push(extract(match));
    }
  }

  return rules;
}

// Tries LLM first, falls back to keyword extraction
export async function compilePolicy(input: string): Promise<PolicyRule[]> {
  try {
    const rules = await compilePolicyWithLLM(input);
    if (rules.length > 0) return rules;
  } catch {
    // LLM unavailable or failed — fall through to keywords
  }

  return compilePolicyWithKeywords(input);
}
