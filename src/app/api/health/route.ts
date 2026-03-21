import { NextResponse } from "next/server";
import { getRecipientAddress } from "@/lib/constants";
import { listOffers, listOffersBySource } from "@/services/content/store";
import { loadBridgeConfig } from "@/lib/bridge-config";
import { getSyncState } from "@/services/bridge/sync";

export async function GET() {
  const chains = ["base", "solana", "icp"] as const;
  const configuredChains = chains.filter((c) => getRecipientAddress(c));

  let storeOk = false;
  let offerCount = 0;
  try {
    const offers = listOffers();
    offerCount = offers.length;
    storeOk = true;
  } catch {
    storeOk = false;
  }

  const bridgeConfig = loadBridgeConfig();
  let bridge: Record<string, unknown> = { enabled: false };
  if (bridgeConfig.enabled) {
    const syncState = getSyncState();
    const bridgedOffers = listOffersBySource("aegis-hontal");
    bridge = {
      enabled: true,
      aegisUrl: bridgeConfig.aegisUrl,
      lastSyncAt: syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toISOString() : null,
      bridgedOffers: bridgedOffers.length,
      consecutiveFailures: syncState.consecutiveFailures,
      lastError: syncState.lastError,
    };
  }

  const healthy = storeOk;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      store: storeOk ? { ok: true, offers: offerCount } : { ok: false },
      configuredChains,
      missingConfig: chains.filter((c) => !getRecipientAddress(c)),
      bridge,
    },
    { status: healthy ? 200 : 503 }
  );
}
