import { NextResponse } from "next/server";
import { getRecipientAddress } from "@/lib/constants";
import { listOffers, listOffersBySource } from "@/services/content/store";
import { loadBridgeConfig } from "@/lib/bridge-config";
import { getSyncState } from "@/services/bridge/sync";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const chains = ["base", "solana", "icp"] as const;
  const configuredChains = chains.filter((c) => getRecipientAddress(c));

  let storeOk = false;
  let offerCount = 0;
  try {
    const offers = await listOffers();
    offerCount = offers.length;
    storeOk = true;
  } catch (err) {
    log.error("Health check: canister store unreachable", { error: String(err) });
  }

  const bridgeConfig = loadBridgeConfig();
  let bridge: Record<string, unknown> = { enabled: false };
  if (bridgeConfig.enabled) {
    const syncState = getSyncState();
    let bridgedCount = 0;
    try {
      bridgedCount = (await listOffersBySource("aegis-hontal")).length;
    } catch (err) {
      log.error("Health check: bridge offer count failed", { error: String(err) });
    }
    bridge = {
      enabled: true,
      aegisUrl: bridgeConfig.aegisUrl,
      lastSyncAt: syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toISOString() : null,
      bridgedOffers: bridgedCount,
      consecutiveFailures: syncState.consecutiveFailures,
      lastError: syncState.lastError,
    };
  }

  return NextResponse.json(
    {
      status: storeOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      store: storeOk ? { ok: true, offers: offerCount } : { ok: false },
      configuredChains,
      missingConfig: chains.filter((c) => !getRecipientAddress(c)),
      bridge,
    },
    { status: storeOk ? 200 : 503 }
  );
}
