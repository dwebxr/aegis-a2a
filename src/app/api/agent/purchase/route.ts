import { NextRequest, NextResponse } from "next/server";
import { unlockContent } from "@/services/content/unlock";
import { getOffer } from "@/services/content/store";
import { isValidChain } from "@/lib/constants";
import { isRateLimited } from "@/lib/rate-limit";
import { parsePolicyHeader, enforcePolicy, extractRateLimit } from "@/services/policy/enforcer";
import { pushEvent, offerPurchasedEvent } from "@/services/activity/aggregator";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const policyRules = parsePolicyHeader(req.headers.get("x-aegis-policy"));
  const policyRateLimit = extractRateLimit(policyRules);

  if (isRateLimited(`purchase:${ip}`, policyRateLimit?.maxRequests, policyRateLimit?.windowMs)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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

    // Policy enforcement: check the target offer against client policy
    if (policyRules.length > 0) {
      const offer = await getOffer(offerId);
      if (offer) {
        const enforcement = enforcePolicy(offer, policyRules);
        if (!enforcement.allowed) {
          return NextResponse.json(
            { error: "Policy violation", violations: enforcement.violations },
            { status: 403 },
          );
        }
      }
    }

    const result = await unlockContent(offerId, txHash, chain, payer);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 402 });
    }

    // Emit purchase activity event
    const offer = await getOffer(offerId);
    if (offer) {
      pushEvent(offerPurchasedEvent(offer, payer || "anonymous", txHash, chain, offer.priceUsdc));
    }

    return NextResponse.json({ content: result.content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
