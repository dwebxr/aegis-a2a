import type { Offer, OfferFilter } from "@/types/offer";
import type { CanisterOffer, CanisterReceipt } from "@/lib/ic/declarations";
import { getBackendActor } from "@/lib/ic/actor";
import { generateId } from "@/lib/utils";
import { log } from "@/lib/logger";

// micro-USDC (×10^6) — canister priceUSDC is Nat, so we scale to preserve decimals
const USDC_SCALE = 1_000_000;

// Extra A2A fields are JSON-packed into the canister's `description` field

interface OfferMeta {
  description: string;
  encryptedContent?: string;
  supportedChains: string[];
  sourceRef?: Offer["sourceRef"];
  vclScores?: Offer["vclScores"];
  topics?: string[];
  sourceUrl?: string;
  sourceName?: string;
  imageUrl?: string;
}

function toCanisterOffer(offer: Offer): CanisterOffer {
  const meta: OfferMeta = {
    description: offer.description,
    encryptedContent: offer.encryptedContent,
    supportedChains: offer.supportedChains,
    sourceRef: offer.sourceRef,
    vclScores: offer.vclScores,
    topics: offer.topics,
    sourceUrl: offer.sourceUrl,
    sourceName: offer.sourceName,
    imageUrl: offer.imageUrl,
  };
  return {
    id: offer.id,
    contentHash: offer.contentHash,
    publisher: offer.agentId,
    priceUSDC: BigInt(Math.round(offer.priceUsdc * USDC_SCALE)),
    chain: offer.supportedChains[0] || "base",
    vclScore: offer.vclScores?.composite ?? 0,
    title: offer.title,
    description: JSON.stringify(meta),
    createdAt: BigInt(offer.createdAt),
  };
}

function fromCanisterOffer(co: CanisterOffer): Offer {
  let meta: Partial<OfferMeta> = {};
  try {
    meta = JSON.parse(co.description) as Partial<OfferMeta>;
  } catch {
    // description is plain text, not JSON — legacy data
    meta = { description: co.description };
  }
  return {
    id: co.id,
    agentId: co.publisher,
    title: co.title,
    description: meta.description ?? co.description,
    priceUsdc: Number(co.priceUSDC) / USDC_SCALE,
    contentHash: co.contentHash,
    supportedChains: meta.supportedChains?.length
      ? (meta.supportedChains as Offer["supportedChains"])
      : [co.chain as Offer["supportedChains"][number]],
    createdAt: Number(co.createdAt),
    encryptedContent: meta.encryptedContent,
    sourceRef: meta.sourceRef,
    vclScores: meta.vclScores,
    topics: meta.topics,
    sourceUrl: meta.sourceUrl,
    sourceName: meta.sourceName,
    imageUrl: meta.imageUrl,
  };
}

export async function addOffer(
  offer: Omit<Offer, "id" | "createdAt">,
): Promise<Offer> {
  const newOffer: Offer = { ...offer, id: generateId(), createdAt: Date.now() };
  await getBackendActor().put_offer(toCanisterOffer(newOffer));
  return newOffer;
}

export async function getOffer(id: string): Promise<Offer | undefined> {
  const all = await listOffers();
  return all.find((o) => o.id === id);
}

const CANISTER_PAGE_SIZE = BigInt(100);
const MAX_TOTAL_OFFERS = 10_000; // safety cap to prevent unbounded fetching

async function fetchAllOffers(): Promise<CanisterOffer[]> {
  const actor = getBackendActor();
  const all: CanisterOffer[] = [];
  let offset = BigInt(0);
  while (all.length < MAX_TOTAL_OFFERS) {
    const page = await actor.get_offers(offset, CANISTER_PAGE_SIZE);
    all.push(...page);
    if (page.length < Number(CANISTER_PAGE_SIZE)) break;
    offset += CANISTER_PAGE_SIZE;
  }
  return all;
}

export async function listOffers(filter?: OfferFilter): Promise<Offer[]> {
  const raw = await fetchAllOffers();
  let result = raw.map(fromCanisterOffer);

  if (filter) {
    const { chain, minPrice, maxPrice, agentId, sourceSystem } = filter;
    if (chain) result = result.filter((o) => o.supportedChains.includes(chain));
    if (minPrice !== undefined)
      result = result.filter((o) => o.priceUsdc >= minPrice);
    if (maxPrice !== undefined)
      result = result.filter((o) => o.priceUsdc <= maxPrice);
    if (agentId) result = result.filter((o) => o.agentId === agentId);
    if (sourceSystem)
      result = result.filter((o) => o.sourceRef?.system === sourceSystem);
  }

  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateOffer(
  id: string,
  updates: Partial<Omit<Offer, "id" | "createdAt">>,
): Promise<Offer | undefined> {
  const existing = await getOffer(id);
  if (!existing) return undefined;
  const updated: Offer = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
  };
  const actor = getBackendActor();
  await actor.put_offer(toCanisterOffer(updated));
  return updated;
}

export async function findOfferBySourceRef(
  externalId: string,
): Promise<Offer | undefined> {
  const all = await listOffers();
  return all.find((o) => o.sourceRef?.externalId === externalId);
}

export async function listOffersBySource(system: string): Promise<Offer[]> {
  const all = await listOffers();
  return all.filter((o) => o.sourceRef?.system === system);
}

export async function recordPurchase(
  offerId: string,
  txHash: string,
  chain: string,
  payer: string,
  amount: number,
  contentHash: string,
): Promise<void> {
  const actor = getBackendActor();
  const receipt: CanisterReceipt = {
    txHash,
    chain,
    contentHash,
    payer,
    amount: BigInt(Math.round(amount * USDC_SCALE)),
    verified: true,
  };
  await actor.submit_receipt(receipt);
  log.info("Receipt submitted to canister", { offerId, txHash });
}

// Cross-offer replay protection: canister indexes receipts by txHash only
export async function isTransactionUsed(txHash: string): Promise<boolean> {
  const actor = getBackendActor();
  const result = await actor.get_receipt(txHash);
  return result.length > 0;
}
