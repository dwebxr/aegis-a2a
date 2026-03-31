import { NextRequest, NextResponse } from "next/server";
import { listOffers } from "@/services/content/store";
import { aggregateEvents } from "@/services/activity/aggregator";
import { log } from "@/lib/logger";
import type { ActivityFeedResponse } from "@/types/activity";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? Number(cursorParam) : undefined;
  if (cursorParam && !Number.isFinite(cursor)) {
    return NextResponse.json(
      { error: "cursor must be a valid number" },
      { status: 400 },
    );
  }

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 100) : 50;

  try {
    const offers = await listOffers();
    const result = aggregateEvents(offers, cursor, limit);

    const body: ActivityFeedResponse = {
      events: result.events,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };

    return NextResponse.json(body);
  } catch (err) {
    log.error("GET /api/activity/feed failed", { error: String(err) });
    return NextResponse.json(
      { error: "Failed to fetch activity feed" },
      { status: 502 },
    );
  }
}
