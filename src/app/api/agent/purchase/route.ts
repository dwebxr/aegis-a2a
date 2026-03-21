import { NextRequest, NextResponse } from "next/server";
import { unlockContent } from "@/services/content/unlock";
import { isValidChain } from "@/lib/constants";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`purchase:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { offerId, txHash, chain } = body;

    if (!offerId || !txHash || !chain) {
      return NextResponse.json(
        { error: "Missing required fields: offerId, txHash, chain" },
        { status: 400 }
      );
    }

    if (!isValidChain(chain)) {
      return NextResponse.json({ error: `Invalid chain: ${chain}` }, { status: 400 });
    }

    const result = await unlockContent(offerId, txHash, chain);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 402 });
    }

    return NextResponse.json({ content: result.content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
