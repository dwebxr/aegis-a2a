import type { ActivityEvent } from "@/types/activity";
import { getBackendActor } from "@/lib/ic/actor";

const EVENT_PAYER_PREFIX = "a2a-event:";

// Persist an activity event as a canister receipt.
// Uses receipt fields creatively: txHash=eventId, contentHash=JSON, payer=type prefix.
export async function persistEvent(event: ActivityEvent): Promise<void> {
  const actor = getBackendActor();
  const payload = JSON.stringify({
    type: event.type,
    actorId: event.actorId,
    summary: event.summary,
    metadata: event.metadata,
    chain: event.chain,
    offerId: event.offerId,
    txHash: event.txHash,
  });

  await actor.submit_receipt({
    txHash: `evt-${event.id}`,
    chain: event.chain || "icp",
    contentHash: payload,
    payer: `${EVENT_PAYER_PREFIX}${event.type}`,
    amount: BigInt(event.timestamp),  // store timestamp in amount field
    verified: true,
  });
}

// Restore an activity event from a canister receipt.
export function receiptToEvent(receipt: {
  txHash: string;
  contentHash: string;
  payer: string;
  amount: bigint;
}): ActivityEvent | null {
  if (!receipt.payer.startsWith(EVENT_PAYER_PREFIX)) return null;
  if (!receipt.txHash.startsWith("evt-")) return null;

  const eventId = receipt.txHash.slice(4);
  const timestamp = Number(receipt.amount);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(receipt.contentHash);
  } catch {
    return null;
  }

  return {
    id: eventId,
    type: data.type as ActivityEvent["type"],
    timestamp,
    actorId: (data.actorId as string) || "unknown",
    summary: (data.summary as string) || "",
    metadata: (data.metadata as Record<string, unknown>) || {},
    chain: data.chain as ActivityEvent["chain"],
    txHash: data.txHash as string | undefined,
    offerId: data.offerId as string | undefined,
  };
}

// Check if an event is already persisted
export async function isEventPersisted(eventId: string): Promise<boolean> {
  const actor = getBackendActor();
  const result = await actor.get_receipt(`evt-${eventId}`);
  return result.length > 0;
}
