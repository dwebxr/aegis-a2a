import { NextRequest, NextResponse } from "next/server";
import { unlockContent } from "@/services/content/unlock";
import { isValidChain } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { offerId, txHash, chain, payer } = body;

    if (!offerId || !txHash || !chain) {
      return NextResponse.json(
        { error: "Missing required fields: offerId, txHash, chain" },
        { status: 400 }
      );
    }

    if (!isValidChain(chain)) {
      return NextResponse.json({ error: `Invalid chain: ${chain}` }, { status: 400 });
    }

    const result = await unlockContent(offerId, txHash, chain, payer);

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
