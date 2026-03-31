"use client";

import { useState, useEffect, useCallback } from "react";
import type { PolicyDocument, PolicyRule } from "@/types/policy";

const STORAGE_KEY = "aegis-policies";

function loadPolicies(): PolicyDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PolicyDocument[]) : [];
  } catch {
    // Corrupted policy data — clear and start fresh
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function savePolicies(policies: PolicyDocument[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policies));
}

export function usePolicy() {
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [activePolicy, setActivePolicy] = useState<PolicyDocument | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadPolicies();
    setPolicies(loaded);
    const activeId = localStorage.getItem("aegis-active-policy");
    const active = activeId ? loaded.find((p) => p.id === activeId) : undefined;
    if (active) setActivePolicy(active);
  }, []);

  const compile = useCallback(async (input: string): Promise<PolicyRule[]> => {
    setIsCompiling(true);
    setCompileError(null);
    try {
      const { compilePolicy } = await import("@/services/policy/compiler");
      const rules = await compilePolicy(input);
      return rules;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Compilation failed";
      setCompileError(msg);
      return [];
    } finally {
      setIsCompiling(false);
    }
  }, []);

  const savePolicy = useCallback(
    (doc: PolicyDocument) => {
      const updated = [...policies.filter((p) => p.id !== doc.id), doc];
      setPolicies(updated);
      savePolicies(updated);
    },
    [policies],
  );

  const removePolicy = useCallback(
    (id: string) => {
      const updated = policies.filter((p) => p.id !== id);
      setPolicies(updated);
      savePolicies(updated);
      if (activePolicy?.id === id) {
        setActivePolicy(null);
        localStorage.removeItem("aegis-active-policy");
      }
    },
    [policies, activePolicy],
  );

  const activate = useCallback(
    (id: string | null) => {
      if (!id) {
        setActivePolicy(null);
        localStorage.removeItem("aegis-active-policy");
        return;
      }
      const policy = policies.find((p) => p.id === id);
      if (policy) {
        setActivePolicy(policy);
        localStorage.setItem("aegis-active-policy", id);
      }
    },
    [policies],
  );

  /**
   * Serialize the active policy rules as a JSON string for the X-Aegis-Policy header.
   */
  const getPolicyHeader = useCallback((): string | null => {
    if (!activePolicy || activePolicy.rules.length === 0) return null;
    return JSON.stringify(activePolicy.rules);
  }, [activePolicy]);

  return {
    policies,
    activePolicy,
    isCompiling,
    compileError,
    compile,
    savePolicy,
    removePolicy,
    activate,
    getPolicyHeader,
  };
}
