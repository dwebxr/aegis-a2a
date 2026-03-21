"use client";

import type { Offer, ScoredOffer } from "@/types/offer";
import type { Interaction, Preference } from "./db";
import { generateCompletion, isReady } from "./llm-engine";
import { getRecentInteractions, getPreferences, cacheRanking, getCachedRanking } from "./db";

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export async function rankOffers(offers: Offer[]): Promise<ScoredOffer[]> {
  if (offers.length === 0) return [];

  const cached: ScoredOffer[] = [];
  const uncached: Offer[] = [];

  for (const offer of offers) {
    const score = await getCachedRanking(offer.id);
    if (score !== null) {
      cached.push({ ...offer, resonanceScore: score });
    } else {
      uncached.push(offer);
    }
  }

  if (uncached.length === 0) {
    return cached.sort((a, b) => b.resonanceScore - a.resonanceScore);
  }

  const [interactions, preferences] = await Promise.all([
    getRecentInteractions(20),
    getPreferences(),
  ]);

  const scored = isReady() && preferences.length > 0
    ? await rankWithLLM(uncached, preferences, interactions)
    : rankWithKeywords(uncached, preferences);

  await Promise.all(scored.map((o) => cacheRanking(o.id, o.resonanceScore)));

  return [...cached, ...scored].sort((a, b) => b.resonanceScore - a.resonanceScore);
}

async function rankWithLLM(
  offers: Offer[],
  preferences: Preference[],
  interactions: Interaction[]
): Promise<ScoredOffer[]> {
  const prefList = preferences.map((p) => `${p.topic} (weight: ${p.weight})`).join(", ");
  const historyTags = interactions
    .filter((i) => i.action === "purchase")
    .flatMap((i) => i.tags)
    .slice(0, 20);

  const offerSummaries = offers
    .map((o, i) => `${i}: "${o.title}" - ${o.description}`)
    .join("\n");

  const prompt = `You are a recommendation engine. Score each offer 0-100 based on relevance to the user.

User interests: ${prefList}
Recent purchase topics: ${historyTags.length > 0 ? historyTags.join(", ") : "none"}

Offers:
${offerSummaries}

Respond ONLY with a JSON array of scores, e.g. [85, 42, 91]. No other text.`;

  try {
    const response = await generateCompletion(prompt);
    const scores = JSON.parse(response.trim()) as number[];

    return offers.map((offer, i) => ({
      ...offer,
      resonanceScore: clampScore(scores[i] ?? 50),
    }));
  } catch (error) {
    console.warn("[Ranker] LLM ranking failed, using keyword fallback:", error);
    return rankWithKeywords(offers, preferences);
  }
}

function rankWithKeywords(offers: Offer[], preferences: Preference[]): ScoredOffer[] {
  return offers.map((offer) => {
    let score = 50;
    const text = `${offer.title} ${offer.description}`.toLowerCase();

    for (const pref of preferences) {
      if (text.includes(pref.topic.toLowerCase())) {
        score += pref.weight * 30;
      }
    }

    return { ...offer, resonanceScore: clampScore(score) };
  });
}
