import type { ActivityEvent } from "@/types/activity";
import type { Offer, ChainType } from "@/types/offer";
import type { SyncResult } from "@/services/bridge/sync";
import { generateId } from "@/lib/utils";
import { formatActivityEvent } from "./formatter";
import { persistEvent } from "./persistence";

// In-memory buffer for fast access; persisted to canister for durability
const MAX_BUFFER_SIZE = 500;
const eventBuffer: ActivityEvent[] = [];

export function pushEvent(event: ActivityEvent): void {
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_BUFFER_SIZE * 1.5) {
    const trimmed = eventBuffer.slice(-MAX_BUFFER_SIZE);
    eventBuffer.length = 0;
    eventBuffer.push(...trimmed);
  }
  // Fire-and-forget persistence — buffer is the primary read path
  persistEvent(event).catch(() => {});
}

export function getBufferedEvents(): readonly ActivityEvent[] {
  return eventBuffer;
}

export function clearBuffer(): void {
  eventBuffer.length = 0;
}


function withSummary(event: ActivityEvent): ActivityEvent {
  event.summary = formatActivityEvent(event);
  return event;
}

export function offerPublishedEvent(offer: Offer): ActivityEvent {
  return withSummary({
    id: generateId(),
    type: "offer_published",
    timestamp: offer.createdAt,
    actorId: offer.agentId,
    summary: "",
    metadata: {
      title: offer.title,
      priceUsdc: offer.priceUsdc,
      topics: offer.topics,
      isBridged: !!offer.sourceRef,
    },
    offerId: offer.id,
    chain: offer.supportedChains[0],
  });
}

export function offerPurchasedEvent(
  offer: Offer,
  payer: string,
  txHash: string,
  chain: ChainType,
  amount: number,
): ActivityEvent {
  return withSummary({
    id: generateId(),
    type: "offer_purchased",
    timestamp: Date.now(),
    actorId: payer,
    summary: "",
    metadata: {
      title: offer.title,
      amount,
      agentId: offer.agentId,
    },
    offerId: offer.id,
    chain,
    txHash,
  });
}

export function bridgeSyncEvent(result: SyncResult): ActivityEvent {
  return withSummary({
    id: generateId(),
    type: "bridge_sync",
    timestamp: Date.now(),
    actorId: "aegis-bridge",
    summary: "",
    metadata: {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      removed: result.removed,
    },
  });
}

export function contentViewedEvent(
  offer: Offer,
  viewer: string,
): ActivityEvent {
  return withSummary({
    id: generateId(),
    type: "content_viewed",
    timestamp: Date.now(),
    actorId: viewer,
    summary: "",
    metadata: { title: offer.title },
    offerId: offer.id,
  });
}

// Merge offer-derived publish events with buffered ephemeral events into a timeline
export function aggregateEvents(
  offers: Offer[],
  cursor?: number,
  limit = 50,
): { events: ActivityEvent[]; cursor: number | null; hasMore: boolean } {
  // Derive publish events from offers
  const publishEvents = offers.map(offerPublishedEvent);

  // Merge with buffered ephemeral events (purchases, syncs, views)
  const all = [...publishEvents, ...eventBuffer];

  // Sort descending by timestamp
  all.sort((a, b) => b.timestamp - a.timestamp);

  // Apply cursor-based pagination (cursor = timestamp, exclusive)
  const filtered = cursor ? all.filter((e) => e.timestamp < cursor) : all;
  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor = page.length > 0 ? page[page.length - 1].timestamp : null;

  return { events: page, cursor: nextCursor, hasMore };
}
