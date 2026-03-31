import type { ChainType } from "./offer";

export type ActivityEventType =
  | "offer_published"
  | "offer_purchased"
  | "bridge_sync"
  | "content_viewed"
  | "policy_applied";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: number;
  actorId: string;
  summary: string;
  metadata: Record<string, unknown>;
  chain?: ChainType;
  txHash?: string;
  offerId?: string;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  cursor: number | null;
  hasMore: boolean;
}
