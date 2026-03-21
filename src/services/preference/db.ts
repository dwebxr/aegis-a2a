import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface Interaction {
  id: string;
  offerId: string;
  action: "view" | "purchase" | "dismiss";
  timestamp: number;
  tags: string[];
}

export interface Preference {
  id: string;
  topic: string;
  weight: number;
  updatedAt: number;
}

interface AegisPreferencesDB extends DBSchema {
  interactions: {
    key: string;
    value: Interaction;
    indexes: { "by-timestamp": number };
  };
  preferences: {
    key: string;
    value: Preference;
  };
  rankings: {
    key: string;
    value: {
      offerId: string;
      score: number;
      computedAt: number;
    };
  };
}

let dbInstance: IDBPDatabase<AegisPreferencesDB> | null = null;

async function getDB(): Promise<IDBPDatabase<AegisPreferencesDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AegisPreferencesDB>("aegis-preferences", 1, {
    upgrade(db) {
      const interactionStore = db.createObjectStore("interactions", {
        keyPath: "id",
      });
      interactionStore.createIndex("by-timestamp", "timestamp");
      db.createObjectStore("preferences", { keyPath: "id" });
      db.createObjectStore("rankings", { keyPath: "offerId" });
    },
  });

  return dbInstance;
}

export async function recordInteraction(
  offerId: string,
  action: Interaction["action"],
  tags: string[] = []
): Promise<void> {
  const db = await getDB();
  await db.add("interactions", {
    id: crypto.randomUUID(),
    offerId,
    action,
    timestamp: Date.now(),
    tags,
  });
}

export async function getRecentInteractions(limit = 50): Promise<Interaction[]> {
  const db = await getDB();
  const results: Interaction[] = [];
  const tx = db.transaction("interactions", "readonly");
  const index = tx.store.index("by-timestamp");

  // Use cursor in reverse to get most recent first, avoiding loading all records
  let cursor = await index.openCursor(null, "prev");
  while (cursor && results.length < limit) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }

  return results;
}

export async function setPreference(
  topic: string,
  weight: number
): Promise<void> {
  const db = await getDB();
  const id = topic.toLowerCase().replace(/\s+/g, "-");
  await db.put("preferences", {
    id,
    topic,
    weight: Math.max(0, Math.min(1, weight)),
    updatedAt: Date.now(),
  });
  await clearRankingCache();
}

export async function getPreferences(): Promise<Preference[]> {
  const db = await getDB();
  return db.getAll("preferences");
}

export async function removePreference(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("preferences", id);
  await clearRankingCache();
}

export async function clearRankingCache(): Promise<void> {
  const db = await getDB();
  await db.clear("rankings");
}

export async function cacheRanking(offerId: string, score: number): Promise<void> {
  const db = await getDB();
  await db.put("rankings", { offerId, score, computedAt: Date.now() });
}

const RANKING_CACHE_TTL = 3600_000; // 1 hour

export async function getCachedRanking(offerId: string): Promise<number | null> {
  const db = await getDB();
  const entry = await db.get("rankings", offerId);
  if (!entry || Date.now() - entry.computedAt > RANKING_CACHE_TTL) return null;
  return entry.score;
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear("interactions"),
    db.clear("preferences"),
    db.clear("rankings"),
  ]);
}
