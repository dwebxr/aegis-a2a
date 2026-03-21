import type { Offer, OfferFilter } from "@/types/offer";
import { generateId } from "@/lib/utils";
import { log } from "@/lib/logger";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.AEGIS_DATA_DIR || path.join(process.cwd(), ".aegis-data");
const OFFERS_FILE = path.join(DATA_DIR, "offers.json");
const PURCHASES_FILE = path.join(DATA_DIR, "purchases.json");

let offers = new Map<string, Offer>();
let purchases = new Set<string>();
let loaded = false;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromDisk(): void {
  if (loaded) return;
  loaded = true;

  try {
    ensureDataDir();

    if (fs.existsSync(OFFERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(OFFERS_FILE, "utf-8")) as Offer[];
      offers = new Map(data.map((o) => [o.id, o]));
    }

    if (fs.existsSync(PURCHASES_FILE)) {
      const data = JSON.parse(fs.readFileSync(PURCHASES_FILE, "utf-8")) as string[];
      purchases = new Set(data);
    }
  } catch (err) {
    log.error("Failed to load persisted data", { err: String(err) });
  }
}

function persistOffers(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(OFFERS_FILE, JSON.stringify(Array.from(offers.values()), null, 2));
  } catch (err) {
    log.error("Failed to persist offers", { err: String(err) });
  }
}

function persistPurchases(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(Array.from(purchases)));
  } catch (err) {
    log.error("Failed to persist purchases", { err: String(err) });
  }
}

export function addOffer(offer: Omit<Offer, "id" | "createdAt">): Offer {
  loadFromDisk();
  const newOffer: Offer = { ...offer, id: generateId(), createdAt: Date.now() };
  offers.set(newOffer.id, newOffer);
  persistOffers();
  return newOffer;
}

export function getOffer(id: string): Offer | undefined {
  loadFromDisk();
  return offers.get(id);
}

export function listOffers(filter?: OfferFilter): Offer[] {
  loadFromDisk();
  let result = Array.from(offers.values());

  if (filter) {
    const { chain, minPrice, maxPrice, agentId, sourceSystem } = filter;
    if (chain) result = result.filter((o) => o.supportedChains.includes(chain));
    if (minPrice !== undefined) result = result.filter((o) => o.priceUsdc >= minPrice);
    if (maxPrice !== undefined) result = result.filter((o) => o.priceUsdc <= maxPrice);
    if (agentId) result = result.filter((o) => o.agentId === agentId);
    if (sourceSystem) result = result.filter((o) => o.sourceRef?.system === sourceSystem);
  }

  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function updateOffer(
  id: string,
  updates: Partial<Omit<Offer, "id" | "createdAt">>,
): Offer | undefined {
  loadFromDisk();
  const existing = offers.get(id);
  if (!existing) return undefined;
  const updated: Offer = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };
  offers.set(id, updated);
  persistOffers();
  return updated;
}

export function findOfferBySourceRef(externalId: string): Offer | undefined {
  loadFromDisk();
  return Array.from(offers.values()).find(
    (o) => o.sourceRef?.externalId === externalId,
  );
}

export function listOffersBySource(system: string): Offer[] {
  loadFromDisk();
  return Array.from(offers.values()).filter(
    (o) => o.sourceRef?.system === system,
  );
}

export function removeOffer(id: string): boolean {
  loadFromDisk();
  const result = offers.delete(id);
  if (result) persistOffers();
  return result;
}

export function recordPurchase(offerId: string, txHash: string): void {
  loadFromDisk();
  purchases.add(`${offerId}:${txHash}`);
  persistPurchases();
}

export function isPurchased(offerId: string, txHash: string): boolean {
  loadFromDisk();
  return purchases.has(`${offerId}:${txHash}`);
}

export function _resetForTesting(): void {
  offers = new Map();
  purchases = new Set();
  loaded = false;
}
