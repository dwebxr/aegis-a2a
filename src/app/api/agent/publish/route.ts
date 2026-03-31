import { NextRequest, NextResponse } from "next/server";
import { addOffer } from "@/services/content/store";
import { isValidChain, VALID_CHAINS } from "@/lib/constants";
import { isRateLimited } from "@/lib/rate-limit";
import { validateVCLScores, checkVCLThreshold } from "@/lib/vcl";
import { parsePolicyHeader, enforcePolicy, extractRateLimit } from "@/services/policy/enforcer";
import { pushEvent, offerPublishedEvent } from "@/services/activity/aggregator";
import type { ChainType } from "@/types/offer";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const policyRules = parsePolicyHeader(req.headers.get("x-aegis-policy"));
  const policyRateLimit = extractRateLimit(policyRules);

  if (isRateLimited(`publish:${ip}`, policyRateLimit?.maxRequests, policyRateLimit?.windowMs)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { agentId, title, description, priceUsdc, content, supportedChains, contentHash, vclScores, topics, sourceUrl, sourceName, imageUrl, publisherDid } = body as Record<string, unknown>;
  const optionalMeta: { topics?: string[]; sourceUrl?: string; sourceName?: string; imageUrl?: string; publisherDid?: string } = {};
  if (Array.isArray(topics)) optionalMeta.topics = topics.filter((t): t is string => typeof t === "string");
  if (typeof sourceUrl === "string" && sourceUrl) optionalMeta.sourceUrl = sourceUrl;
  if (typeof sourceName === "string" && sourceName) optionalMeta.sourceName = sourceName;
  if (typeof imageUrl === "string" && imageUrl) optionalMeta.imageUrl = imageUrl;
  if (typeof publisherDid === "string" && publisherDid) optionalMeta.publisherDid = publisherDid;

  const MAX_CONTENT_SIZE = 1_000_000;
  if (typeof content === "string" && content.length > MAX_CONTENT_SIZE) {
    return NextResponse.json(
      { error: `Content too large: ${content.length} chars (max ${MAX_CONTENT_SIZE})` },
      { status: 413 }
    );
  }

  if (!agentId || !title || !description || priceUsdc == null || !content) {
    return NextResponse.json(
      { error: "Missing required fields: agentId, title, description, priceUsdc, content" },
      { status: 400 }
    );
  }

  if (typeof priceUsdc !== "number" || priceUsdc < 0) {
    return NextResponse.json(
      { error: "priceUsdc must be a non-negative number" },
      { status: 400 }
    );
  }

  const chains: ChainType[] = supportedChains
    ? (supportedChains as string[]).filter(isValidChain)
    : [...VALID_CHAINS];

  if (chains.length === 0) {
    return NextResponse.json(
      { error: "At least one valid chain must be specified" },
      { status: 400 }
    );
  }

  // VCL gate: paid offers require VCL scores and must pass quality threshold
  let resolvedVclScores = vclScores ? validateVCLScores(vclScores).scores : undefined;

  if (priceUsdc > 0) {
    const validation = validateVCLScores(vclScores);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const threshold = checkVCLThreshold(validation.scores!);
    if (!threshold.passed) {
      return NextResponse.json({ error: threshold.reason }, { status: 403 });
    }

    resolvedVclScores = validation.scores;
  }

  // Policy enforcement: check offer against client-provided policy rules
  if (policyRules.length > 0) {
    const enforcement = enforcePolicy(
      {
        agentId: agentId as string,
        priceUsdc: priceUsdc as number,
        supportedChains: chains,
        vclScores: resolvedVclScores,
        topics: optionalMeta.topics,
      },
      policyRules,
    );
    if (!enforcement.allowed) {
      return NextResponse.json(
        { error: "Policy violation", violations: enforcement.violations },
        { status: 403 },
      );
    }
  }

  const offer = await addOffer({
    agentId: agentId as string,
    title: title as string,
    description: description as string,
    priceUsdc: priceUsdc as number,
    contentHash: (contentHash as string) || "",
    supportedChains: chains,
    encryptedContent: content as string,
    vclScores: resolvedVclScores,
    ...optionalMeta,
  });

  // Emit activity event
  pushEvent(offerPublishedEvent(offer));

  return NextResponse.json({ offerId: offer.id }, { status: 201 });
}
