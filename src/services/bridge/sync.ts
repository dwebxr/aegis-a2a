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
import { log } from "@/lib/logger";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.AEGIS_DATA_DIR || path.join(process.cwd(), ".aegis-data");
const SYNC_STATE_FILE = path.join(DATA_DIR, "bridge-sync-state.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncAt: 0,
  lastBriefingGeneratedAt: null,
  totalSynced: 0,
  totalRemoved: 0,
  consecutiveFailures: 0,
  lastError: null,
};

function loadSyncState(): SyncState {
  if (!fs.existsSync(SYNC_STATE_FILE)) return { ...DEFAULT_SYNC_STATE };
  try {
    const raw = JSON.parse(fs.readFileSync(SYNC_STATE_FILE, "utf-8"));
    if (typeof raw !== "object" || raw === null || typeof raw.lastSyncAt !== "number") {
      return { ...DEFAULT_SYNC_STATE };
    }
    return raw as SyncState;
  } catch {
    log.warn("Corrupt bridge sync state file, resetting", { path: SYNC_STATE_FILE });
    return { ...DEFAULT_SYNC_STATE };
  }
}

function saveSyncState(state: SyncState): void {
  ensureDataDir();
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

export function getSyncState(): SyncState {
  return loadSyncState();
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
  } catch {
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
  // principal is required for individual briefings with full content
  if (config.principal) params.set("principal", config.principal);
  if (options?.preview) params.set("preview", "true");
  if (options?.since) params.set("since", options.since);

  const qs = params.toString();
  const url = `${config.aegisUrl}/api/d2a/briefing${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
  });

  // x402 paywall — auto-retry with free-tier preview
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

  // Individual briefing: has items[] with full content
  if (typeof body === "object" && body !== null && Array.isArray(body.items) && typeof body.generatedAt === "string") {
    return body as D2ABriefingResponse;
  }

  // Global briefing (no principal): extract items from contributors' topItems
  // These only have title/topics/briefingScore/verdict — no content or scores
  if (typeof body === "object" && body !== null && Array.isArray(body.contributors)) {
    log.warn("Bridge received global briefing (no principal configured). Items lack full content.");
    throw new Error(
      "AEGIS_BRIDGE_PRINCIPAL is required. Without it, Aegis returns a global summary without item content.",
    );
  }

  throw new Error("Aegis briefing response has unexpected shape");
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

export async function syncFromAegis(config: BridgeConfig): Promise<SyncResult> {
  const state = loadSyncState();
  const result: SyncResult = { created: 0, updated: 0, removed: 0, skipped: 0 };

  // Check /changes first (free, no x402) to skip unnecessary briefing fetches
  if (state.lastSyncAt > 0 && state.consecutiveFailures === 0) {
    const sinceIso = new Date(state.lastSyncAt).toISOString();
    const changes = await fetchAegisChanges(config, sinceIso);
    if (changes && changes.changes.length === 0) {
      log.debug("Bridge sync skipped: no changes since last sync", { since: sinceIso });
      return result;
    }
  }

  const briefing = await fetchAegisBriefing(config, {
    since: state.lastBriefingGeneratedAt ?? undefined,
  });

  if (state.lastBriefingGeneratedAt === briefing.generatedAt && state.consecutiveFailures === 0) {
    return result;
  }

  const allItems = briefing.serendipityPick
    ? [...briefing.items, briefing.serendipityPick]
    : briefing.items;

  const version = new Date(briefing.generatedAt).getTime();
  const incomingOffers = transformBriefingItems(allItems, config, version);

  const existingByExternalId = new Map<string, Offer>();
  for (const offer of listOffersBySource("aegis-hontal")) {
    if (offer.sourceRef) {
      existingByExternalId.set(offer.sourceRef.externalId, offer);
    }
  }

  for (const [externalId, offerData] of Array.from(incomingOffers.entries())) {
    const existing = existingByExternalId.get(externalId);

    if (!existing) {
      addOffer(offerData);
      result.created++;
    } else if (existing.sourceRef && existing.sourceRef.version < version) {
      updateOffer(existing.id, {
        title: offerData.title,
        description: offerData.description,
        priceUsdc: offerData.priceUsdc,
        contentHash: offerData.contentHash,
        encryptedContent: offerData.encryptedContent,
        sourceRef: offerData.sourceRef,
      });
      result.updated++;
    } else {
      result.skipped++;
    }

    existingByExternalId.delete(externalId);
  }

  for (const staleOffer of Array.from(existingByExternalId.values())) {
    removeOffer(staleOffer.id);
    result.removed++;
  }

  saveSyncState({
    lastSyncAt: Date.now(),
    lastBriefingGeneratedAt: briefing.generatedAt,
    totalSynced: state.totalSynced + result.created + result.updated,
    totalRemoved: state.totalRemoved + result.removed,
    consecutiveFailures: 0,
    lastError: null,
  });

  log.info("Bridge sync completed", { ...result, briefingItems: allItems.length });

  return result;
}

export async function runSyncCycle(config: BridgeConfig): Promise<SyncResult | null> {
  if (!config.enabled || !config.aegisUrl) return null;

  const state = loadSyncState();

  try {
    return await syncFromAegis(config);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("Bridge sync failed", { error: errorMsg, attempt: state.consecutiveFailures + 1 });

    saveSyncState({
      ...state,
      consecutiveFailures: state.consecutiveFailures + 1,
      lastError: errorMsg,
      lastSyncAt: Date.now(),
    });

    return null;
  }
}

export function _resetSyncStateForTesting(): void {
  if (fs.existsSync(SYNC_STATE_FILE)) {
    fs.unlinkSync(SYNC_STATE_FILE);
  }
}
