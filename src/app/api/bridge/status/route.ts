import { NextRequest, NextResponse } from "next/server";
import { loadBridgeConfig } from "@/lib/bridge-config";
import { getSyncState, fetchAegisHealth } from "@/services/bridge/sync";
import { listOffersBySource } from "@/services/content/store";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`bridge-status:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = loadBridgeConfig();

  if (!config.enabled) {
    return NextResponse.json({
      enabled: false,
      aegisUrl: null,
      syncState: null,
      aegisHealth: null,
      localStats: { totalBridgedOffers: 0, lastSyncAt: null },
    });
  }

  const syncState = getSyncState();

  return NextResponse.json({
    enabled: true,
    aegisUrl: config.aegisUrl,
    syncState,
    aegisHealth: await fetchAegisHealth(config).catch(() => null),
    localStats: {
      totalBridgedOffers: listOffersBySource("aegis-hontal").length,
      lastSyncAt: syncState.lastSyncAt || null,
    },
  });
}
