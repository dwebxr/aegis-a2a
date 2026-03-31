"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ActivityEvent, ActivityFeedResponse } from "@/types/activity";

const POLL_INTERVAL_MS = 30_000;
const MAX_POLL_FAILURES = 3;

export function useActivityFeed(limit = 30) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const cursorRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pollFailuresRef = useRef(0);

  const fetchFeed = useCallback(
    async (cursor?: number) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", String(cursor));

      const res = await fetch(`/api/activity/feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ActivityFeedResponse;
    },
    [limit],
  );

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsStale(false);
    pollFailuresRef.current = 0;
    try {
      const data = await fetchFeed();
      setEvents(data.events);
      cursorRef.current = data.cursor;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFeed]);

  const pollNew = useCallback(async () => {
    try {
      const data = await fetchFeed();
      pollFailuresRef.current = 0;
      setIsStale(false);
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = data.events.filter((e) => !existingIds.has(e.id));
        if (newEvents.length === 0) return prev;
        return [...newEvents, ...prev].slice(0, 200);
      });
    } catch {
      pollFailuresRef.current++;
      if (pollFailuresRef.current >= MAX_POLL_FAILURES) {
        setIsStale(true);
      }
    }
  }, [fetchFeed]);

  useEffect(() => {
    loadInitial();
    timerRef.current = setInterval(pollNew, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [loadInitial, pollNew]);

  const refetch = useCallback(() => {
    loadInitial();
  }, [loadInitial]);

  return { events, isLoading, error, isStale, refetch };
}
