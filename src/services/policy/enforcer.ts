import type { PolicyRule } from "@/types/policy";
import type { VCLScores, ChainType, Offer } from "@/types/offer";

export interface EnforcementResult {
  allowed: boolean;
  violations: string[];
}

function enforceVCLThreshold(scores: VCLScores | undefined, rule: PolicyRule): string | null {
  if (!scores) return "VCL scores required by policy but not provided";
  const p = rule.params as Record<string, number | undefined>;
  if (p.minComposite !== undefined && scores.composite < p.minComposite) {
    return `VCL composite ${scores.composite} below policy minimum ${p.minComposite}`;
  }
  if (p.minOriginality !== undefined && scores.originality < p.minOriginality) {
    return `VCL originality ${scores.originality} below policy minimum ${p.minOriginality}`;
  }
  if (p.minInsight !== undefined && scores.insight < p.minInsight) {
    return `VCL insight ${scores.insight} below policy minimum ${p.minInsight}`;
  }
  if (p.minCredibility !== undefined && scores.credibility < p.minCredibility) {
    return `VCL credibility ${scores.credibility} below policy minimum ${p.minCredibility}`;
  }
  return null;
}

function enforceChainRestrict(chains: ChainType[], rule: PolicyRule): string | null {
  const allowed = rule.params.allowedChains as string[];
  const disallowed = chains.filter((c) => !allowed.includes(c));
  return disallowed.length > 0
    ? `Chain(s) [${disallowed.join(", ")}] not allowed by policy. Allowed: [${allowed.join(", ")}]`
    : null;
}

function enforcePriceCap(priceUsdc: number, rule: PolicyRule): string | null {
  const max = rule.params.maxUsdc as number;
  return priceUsdc > max ? `Price $${priceUsdc} USDC exceeds policy cap of $${max} USDC` : null;
}

function enforceAgentList(agentId: string, rule: PolicyRule): string | null {
  const ids = rule.params.agentIds as string[];
  if (rule.type === "agent_allowlist" && !ids.includes(agentId)) {
    return `Agent "${agentId}" not in allowlist`;
  }
  if (rule.type === "agent_blocklist" && ids.includes(agentId)) {
    return `Agent "${agentId}" is blocklisted`;
  }
  return null;
}

function enforceTopicFilter(topics: string[] | undefined, rule: PolicyRule): string | null {
  const offerTopics = topics || [];
  const required = (rule.params.requiredTopics as string[] | undefined) || [];
  const excluded = (rule.params.excludedTopics as string[] | undefined) || [];

  if (required.length > 0) {
    const missing = required.filter(
      (t) => !offerTopics.some((ot) => ot.toLowerCase().includes(t.toLowerCase())),
    );
    if (missing.length > 0) return `Required topics missing: [${missing.join(", ")}]`;
  }
  if (excluded.length > 0) {
    const found = excluded.filter(
      (t) => offerTopics.some((ot) => ot.toLowerCase().includes(t.toLowerCase())),
    );
    if (found.length > 0) return `Excluded topics found: [${found.join(", ")}]`;
  }
  return null;
}

// rate_limit rules are enforced at the API middleware level, not per-offer
export function enforcePolicy(offer: Partial<Offer>, rules: PolicyRule[]): EnforcementResult {
  const violations: string[] = [];

  for (const rule of rules) {
    let violation: string | null = null;
    switch (rule.type) {
      case "vcl_threshold":
        violation = enforceVCLThreshold(offer.vclScores, rule);
        break;
      case "chain_restrict":
        if (offer.supportedChains) violation = enforceChainRestrict(offer.supportedChains, rule);
        break;
      case "price_cap":
        if (offer.priceUsdc !== undefined) violation = enforcePriceCap(offer.priceUsdc, rule);
        break;
      case "agent_allowlist":
      case "agent_blocklist":
        if (offer.agentId) violation = enforceAgentList(offer.agentId, rule);
        break;
      case "topic_filter":
        violation = enforceTopicFilter(offer.topics, rule);
        break;
      case "rate_limit":
        break;
    }
    if (violation) violations.push(violation);
  }

  return { allowed: violations.length === 0, violations };
}

/** Returns the most restrictive rate limit (lowest req/s ratio) */
export function extractRateLimit(
  rules: PolicyRule[],
): { maxRequests: number; windowMs: number } | null {
  const rateLimits = rules.filter((r) => r.type === "rate_limit");
  if (rateLimits.length === 0) return null;

  let mostRestrictive = rateLimits[0]!;
  let lowestRate = (mostRestrictive.params.maxRequests as number) / (mostRestrictive.params.windowMs as number);

  for (let i = 1; i < rateLimits.length; i++) {
    const r = rateLimits[i]!;
    const rate = (r.params.maxRequests as number) / (r.params.windowMs as number);
    if (rate < lowestRate) {
      lowestRate = rate;
      mostRestrictive = r;
    }
  }

  return {
    maxRequests: mostRestrictive.params.maxRequests as number,
    windowMs: mostRestrictive.params.windowMs as number,
  };
}

export function parsePolicyHeader(header: string | null): PolicyRule[] {
  if (!header) return [];
  try {
    const parsed = JSON.parse(header);
    return Array.isArray(parsed) ? (parsed as PolicyRule[]) : [];
  } catch {
    return [];
  }
}
