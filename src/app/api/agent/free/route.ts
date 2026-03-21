import { NextRequest, NextResponse } from "next/server";
import { getOffer } from "@/services/content/store";

export async function GET(req: NextRequest) {
  const offerId = req.nextUrl.searchParams.get("offerId");
  if (!offerId) {
    return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
  }

  const offer = getOffer(offerId);
  if (!offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  if (offer.priceUsdc !== 0) {
    return NextResponse.json({ error: "This offer is not free" }, { status: 402 });
  }

  return NextResponse.json({
    content: offer.encryptedContent || "Content unavailable",
  });
}
