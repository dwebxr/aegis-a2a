import { NextRequest, NextResponse } from "next/server";
import { addOffer } from "@/services/content/store";
import { isValidChain, VALID_CHAINS } from "@/lib/constants";
import { isRateLimited } from "@/lib/rate-limit";
import { validateVCLScores, checkVCLThreshold } from "@/lib/vcl";
import type { ChainType } from "@/types/offer";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`publish:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { agentId, title, description, priceUsdc, content, supportedChains, contentHash, vclScores, topics, sourceUrl, sourceName, imageUrl } = body as Record<string, unknown>;
  const optionalMeta: { topics?: string[]; sourceUrl?: string; sourceName?: string; imageUrl?: string } = {};
  if (Array.isArray(topics)) optionalMeta.topics = topics.filter((t): t is string => typeof t === "string");
  if (typeof sourceUrl === "string" && sourceUrl) optionalMeta.sourceUrl = sourceUrl;
  if (typeof sourceName === "string" && sourceName) optionalMeta.sourceName = sourceName;
  if (typeof imageUrl === "string" && imageUrl) optionalMeta.imageUrl = imageUrl;

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
  if (priceUsdc > 0) {
    const validation = validateVCLScores(vclScores);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const threshold = checkVCLThreshold(validation.scores!);
    if (!threshold.passed) {
      return NextResponse.json({ error: threshold.reason }, { status: 403 });
    }

    const offer = addOffer({
      agentId: agentId as string,
      title: title as string,
      description: description as string,
      priceUsdc: priceUsdc as number,
      contentHash: (contentHash as string) || "",
      supportedChains: chains,
      encryptedContent: content as string,
      vclScores: validation.scores,
      ...optionalMeta,
    });

    return NextResponse.json({ offerId: offer.id }, { status: 201 });
  }

  // Free offers: no VCL requirement
  const offer = addOffer({
    agentId: agentId as string,
    title: title as string,
    description: description as string,
    priceUsdc: priceUsdc as number,
    contentHash: (contentHash as string) || "",
    supportedChains: chains,
    encryptedContent: content as string,
    vclScores: vclScores ? validateVCLScores(vclScores).scores : undefined,
    ...optionalMeta,
  });

  return NextResponse.json({ offerId: offer.id }, { status: 201 });
}
