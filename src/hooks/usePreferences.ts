"use client";

import { useState, useEffect, useCallback } from "react";
import type { Preference } from "@/services/preference/db";

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPreferences = useCallback(async () => {
    try {
      const { getPreferences } = await import("@/services/preference/db");
      setPreferences(await getPreferences());
    } catch (err) {
      console.error("Failed to load preferences:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const addPreference = useCallback(
    async (topic: string, weight = 0.7) => {
      const { setPreference } = await import("@/services/preference/db");
      await setPreference(topic, weight);
      await loadPreferences();
    },
    [loadPreferences]
  );

  const removePreference = useCallback(
    async (id: string) => {
      const db = await import("@/services/preference/db");
      await db.removePreference(id);
      await loadPreferences();
    },
    [loadPreferences]
  );

  const clearAll = useCallback(async () => {
    const { clearAllData } = await import("@/services/preference/db");
    await clearAllData();
    setPreferences([]);
  }, []);

  return { preferences, isLoading, addPreference, removePreference, clearAll, refresh: loadPreferences };
}
