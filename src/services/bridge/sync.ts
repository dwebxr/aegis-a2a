import type {
  BridgeConfig,
  SyncState,
  D2ABriefingResponse,
  AegisD2AHealth,
  ChangesResponse,
} from "@/types/bridge";
import type { Offer } from "@/types/offer";
import { addOffer, updateOffer, removeOffer, listOffersBySource } from "@/services/content/store";
import { transformBriefingItems } from "./transform";
import { fetchOgImage } from "@/lib/ogp";
import { log } from "@/lib/logger";

// ── In-memory sync state (stateless across restarts → full re-sync on boot) ──
let syncState: SyncState = {
  lastSyncAt: 0,
  lastBriefingGeneratedAt: null,
  totalSynced: 0,
  consecutiveFailures: 0,
  lastError: null,
};

export function getSyncState(): SyncState {
  return { ...syncState };
}

export async function fetchAegisHealth(config: BridgeConfig): Promise<AegisD2AHealth> {
  const res = await fetch(`${config.aegisUrl}/api/d2a/health`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Aegis health check failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AegisD2AHealth;
}

async function fetchAegisChanges(
  config: BridgeConfig,
  since: string,
): Promise<ChangesResponse | null> {
  const url = `${config.aegisUrl}/api/d2a/briefing/changes?since=${encodeURIComponent(since)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    log.debug("Failed to check /changes endpoint", { error: String(err) });
    return null;
  }
  if (!res.ok) return null;
  return (await res.json()) as ChangesResponse;
}

async function fetchAegisBriefing(
  config: BridgeConfig,
  options?: { preview?: boolean; since?: string },
): Promise<D2ABriefingResponse> {
  const params = new URLSearchParams();
  if (config.principal) params.set("principal", config.principal);
  if (options?.preview) params.set("preview", "true");
  if (options?.since) params.set("since", options.since);

  const qs = params.toString();
  const url = `${config.aegisUrl}/api/d2a/briefing${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
  });

  if (res.status === 402 && !options?.preview) {
    log.info("Aegis briefing paywalled, retrying with preview=true");
    return fetchAegisBriefing(config, { ...options, preview: true });
  }

  if (res.status === 402) {
    throw new Error(
      "Aegis briefing requires x402 payment and free-tier preview is not enabled on this instance.",
    );
  }

  if (!res.ok) {
    throw new Error(`Aegis briefing fetch failed: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  if (!body || typeof body !== "object") throw new Error("Aegis briefing response has unexpected shape");

  if (Array.isArray(body.items) && typeof body.generatedAt === "string") {
    return body as D2ABriefingResponse;
  }

  if (Array.isArray(body.contributors)) {
    throw new Error("AEGIS_BRIDGE_PRINCIPAL is required. Without it, Aegis returns a global summary without item content.");
  }

  throw new Error("Aegis briefing response has unexpected shape");
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  removed: number;
}

export async function syncFromAegis(config: BridgeConfig): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, removed: 0 };

  // Check /changes first (free, no x402) to skip unnecessary briefing fetches
  if (syncState.lastSyncAt > 0 && syncState.consecutiveFailures === 0) {
    const sinceIso = new Date(syncState.lastSyncAt).toISOString();
    const changes = await fetchAegisChanges(config, sinceIso);
    if (changes && changes.changes.length === 0) {
      log.debug("Bridge sync skipped: no changes since last sync", { since: sinceIso });
      return result;
    }
  }

  const briefing = await fetchAegisBriefing(config, {
    since: syncState.lastBriefingGeneratedAt ?? undefined,
  });

  if (syncState.lastBriefingGeneratedAt === briefing.generatedAt && syncState.consecutiveFailures === 0) {
    return result;
  }

  const allItems = briefing.serendipityPick
    ? [...briefing.items, briefing.serendipityPick]
    : briefing.items;

  const version = new Date(briefing.generatedAt).getTime();
  const incomingOffers = transformBriefingItems(allItems, config, version);

  const existingOffers = await listOffersBySource("aegis-hontal");
  const existingByExternalId = new Map<string, Offer>();
  for (const offer of existingOffers) {
    if (offer.sourceRef) {
      existingByExternalId.set(offer.sourceRef.externalId, offer);
    }
  }

  // Fetch OGP images concurrently for offers that need them
  const ogpPromises = new Map<string, Promise<string | undefined>>();
  for (const [externalId, offerData] of Array.from(incomingOffers.entries())) {
    if (!offerData.imageUrl && offerData.sourceUrl) {
      ogpPromises.set(
        externalId,
        fetchOgImage(offerData.sourceUrl).catch(() => undefined),
      );
    }
  }

  const ogpResults = new Map<string, string | undefined>();
  for (const [externalId, promise] of Array.from(ogpPromises.entries())) {
    ogpResults.set(externalId, await promise);
  }

  for (const [externalId, offerData] of Array.from(incomingOffers.entries())) {
    const existing = existingByExternalId.get(externalId);

    const imageUrl = offerData.imageUrl || ogpResults.get(externalId);
    const offerWithImage = imageUrl ? { ...offerData, imageUrl } : offerData;

    if (!existing) {
      await addOffer(offerWithImage);
      result.created++;
    } else if (existing.sourceRef && existing.sourceRef.version < version) {
      await updateOffer(existing.id, {
        title: offerWithImage.title,
        description: offerWithImage.description,
        priceUsdc: offerWithImage.priceUsdc,
        contentHash: offerWithImage.contentHash,
        encryptedContent: offerWithImage.encryptedContent,
        sourceRef: offerWithImage.sourceRef,
        vclScores: offerWithImage.vclScores,
        topics: offerWithImage.topics,
        sourceUrl: offerWithImage.sourceUrl,
        sourceName: offerWithImage.sourceName,
        imageUrl: offerWithImage.imageUrl,
      });
      result.updated++;
    } else {
      result.skipped++;
    }

    existingByExternalId.delete(externalId);
  }

  for (const staleOffer of Array.from(existingByExternalId.values())) {
    await removeOffer(staleOffer.id);
    result.removed++;
  }

  syncState = {
    lastSyncAt: Date.now(),
    lastBriefingGeneratedAt: briefing.generatedAt,
    totalSynced: syncState.totalSynced + result.created + result.updated,
    consecutiveFailures: 0,
    lastError: null,
  };

  log.info("Bridge sync completed", { ...result, briefingItems: allItems.length });

  return result;
}

export async function runSyncCycle(config: BridgeConfig): Promise<SyncResult | null> {
  if (!config.enabled || !config.aegisUrl) return null;

  try {
    return await syncFromAegis(config);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("Bridge sync failed", { error: errorMsg, attempt: syncState.consecutiveFailures + 1 });

    syncState = {
      ...syncState,
      consecutiveFailures: syncState.consecutiveFailures + 1,
      lastError: errorMsg,
      lastSyncAt: Date.now(),
    };

    return null;
  }
}
