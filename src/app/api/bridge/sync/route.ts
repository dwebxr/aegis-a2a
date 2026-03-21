import { NextRequest, NextResponse } from "next/server";
import { loadBridgeConfig } from "@/lib/bridge-config";
import { runSyncCycle } from "@/services/bridge/sync";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`bridge-sync:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = loadBridgeConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "Bridge is not enabled. Set AEGIS_BRIDGE_ENABLED=true" },
      { status: 404 },
    );
  }

  const result = await runSyncCycle(config);
  if (!result) {
    return NextResponse.json(
      { error: "Sync failed. Check server logs for details." },
      { status: 502 },
    );
  }

  return NextResponse.json({ status: "ok", ...result });
}
