"use client";

import { useState, useEffect, useCallback } from "react";

type EngineStatus = "idle" | "loading" | "ready" | "fallback" | "error";

interface LLMStatus {
  status: EngineStatus;
  error: string | null;
}

export function useLocalLLM() {
  const [llmStatus, setLlmStatus] = useState<LLMStatus>({
    status: "idle",
    error: null,
  });

  const init = useCallback(async () => {
    setLlmStatus({ status: "loading", error: null });
    try {
      const { initEngine, getEngineStatus } = await import(
        "@/services/preference/llm-engine"
      );
      await initEngine();
      const { status, error } = getEngineStatus();
      setLlmStatus({ status: status as EngineStatus, error });
    } catch (err) {
      setLlmStatus({
        status: "error",
        error: err instanceof Error ? err.message : "LLM init failed",
      });
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  return llmStatus;
}
