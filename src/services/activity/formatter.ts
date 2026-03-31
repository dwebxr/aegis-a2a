import type { ActivityEvent, ActivityEventType } from "@/types/activity";
import type { ChainType } from "@/types/offer";

const CHAIN_LABELS: Record<ChainType, string> = {
  base: "Base",
  solana: "Solana",
  icp: "ICP",
};

type FormatTable = Record<ActivityEventType, (e: ActivityEvent) => string>;

const formatters: FormatTable = {
  offer_published(e) {
    const price = e.metadata.priceUsdc as number | undefined;
    const priceLabel = price && price > 0 ? `$${price} USDC` : "Free";
    const title = (e.metadata.title as string) || "Untitled";
    return `${e.actorId} published "${title}" (${priceLabel})`;
  },

  offer_purchased(e) {
    const title = (e.metadata.title as string) || "an offer";
    const chain = e.chain ? ` on ${CHAIN_LABELS[e.chain]}` : "";
    const amount = e.metadata.amount as number | undefined;
    const amountLabel = amount ? ` for $${amount} USDC` : "";
    return `${e.actorId} purchased "${title}"${amountLabel}${chain}`;
  },

  bridge_sync(e) {
    const created = (e.metadata.created as number) || 0;
    const updated = (e.metadata.updated as number) || 0;
    const removed = (e.metadata.removed as number) || 0;
    const parts: string[] = [];
    if (created) parts.push(`${created} new`);
    if (updated) parts.push(`${updated} updated`);
    if (removed) parts.push(`${removed} removed`);
    return parts.length
      ? `Bridge sync completed: ${parts.join(", ")}`
      : "Bridge sync completed with no changes";
  },

  content_viewed(e) {
    const title = (e.metadata.title as string) || "content";
    return `${e.actorId} viewed "${title}"`;
  },

  policy_applied(e) {
    const action = (e.metadata.action as string) || "applied";
    const policyName = (e.metadata.policyName as string) || "a policy";
    return `Security policy "${policyName}" ${action}`;
  },
};

export function formatActivityEvent(event: ActivityEvent): string {
  const formatter = formatters[event.type];
  return formatter ? formatter(event) : `Unknown event: ${event.type}`;
}

const ICONS: Record<ActivityEventType, string> = {
  offer_published: "publish",
  offer_purchased: "purchase",
  bridge_sync: "sync",
  content_viewed: "view",
  policy_applied: "policy",
};

export function getEventIcon(type: ActivityEventType): string {
  return ICONS[type] || "unknown";
}
