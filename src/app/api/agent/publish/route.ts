import { NextRequest, NextResponse } from "next/server";
import { addOffer } from "@/services/content/store";
import { isValidChain, VALID_CHAINS } from "@/lib/constants";
import { isRateLimited } from "@/lib/rate-limit";
import type { ChainType } from "@/types/offer";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`publish:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { agentId, title, description, priceUsdc, content, supportedChains, contentHash } = body;

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

    const offer = addOffer({
      agentId,
      title,
      description,
      priceUsdc,
      contentHash: contentHash || "",
      supportedChains: chains,
      encryptedContent: content,
    });

    return NextResponse.json({ offerId: offer.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
