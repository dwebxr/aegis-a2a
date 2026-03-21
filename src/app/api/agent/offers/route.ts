import { NextRequest, NextResponse } from "next/server";
import { listOffers } from "@/services/content/store";
import { isValidChain } from "@/lib/constants";
import type { OfferFilter } from "@/types/offer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter: OfferFilter = {};

  const chain = searchParams.get("chain");
  if (chain && isValidChain(chain)) {
    filter.chain = chain;
  }

  const minPrice = searchParams.get("minPrice");
  if (minPrice !== null) {
    const parsed = Number(minPrice);
    if (!Number.isFinite(parsed)) {
      return NextResponse.json({ error: "minPrice must be a valid number" }, { status: 400 });
    }
    filter.minPrice = parsed;
  }

  const maxPrice = searchParams.get("maxPrice");
  if (maxPrice !== null) {
    const parsed = Number(maxPrice);
    if (!Number.isFinite(parsed)) {
      return NextResponse.json({ error: "maxPrice must be a valid number" }, { status: 400 });
    }
    filter.maxPrice = parsed;
  }

  const agentId = searchParams.get("agentId");
  if (agentId) filter.agentId = agentId;

  const offers = listOffers(filter);

  const publicOffers = offers.map((o) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => k !== "encryptedContent"))
  );

  return NextResponse.json({ offers: publicOffers });
}
