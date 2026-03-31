"use client";

import { useState, useEffect, useCallback } from "react";
import type { WorkflowTemplate } from "@/types/workflow";
import { WorkflowCard } from "./WorkflowCard";

export function WorkflowMarketplace() {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null);
  const [forkStatus, setForkStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleFork = useCallback(
    async (workflow: WorkflowTemplate) => {
      setForkStatus(null);
      try {
        const res = await fetch("/api/workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${workflow.name} (fork)`,
            description: workflow.description,
            author: "local-agent",
            steps: workflow.steps,
            tags: workflow.tags,
            forkedFrom: workflow.id,
          }),
        });
        if (res.ok) {
          setForkStatus({ ok: true, msg: "Workflow forked successfully" });
          fetchWorkflows();
        } else {
          const data = await res.json().catch(() => ({ error: "Unknown error" }));
          setForkStatus({ ok: false, msg: data.error || `Fork failed: HTTP ${res.status}` });
        }
      } catch (err) {
        setForkStatus({ ok: false, msg: err instanceof Error ? err.message : "Fork failed" });
      }
    },
    [fetchWorkflows],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-300 tracking-tight">
          Workflow Marketplace
        </h2>
        <button
          onClick={fetchWorkflows}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      {forkStatus && (
        <div className={`text-xs px-3 py-2 rounded-lg mb-4 ${forkStatus.ok ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
          {forkStatus.msg}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="text-center text-red-400/80 text-xs py-6">
          {error}{" "}
          <button onClick={fetchWorkflows} className="underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.length === 0 ? (
            <div className="col-span-full text-center text-gray-600 text-xs py-12">
              No workflows published yet
            </div>
          ) : (
            workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onSelect={setSelectedWorkflow}
                onFork={handleFork}
              />
            ))
          )}
        </div>
      )}

      {/* Workflow detail modal */}
      {selectedWorkflow && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-medium text-white">
                {selectedWorkflow.name}
              </h3>
              <button
                onClick={() => setSelectedWorkflow(null)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              {selectedWorkflow.description}
            </p>

            <div className="space-y-2 mb-4">
              <p className="text-[10px] text-gray-500 font-medium">Steps:</p>
              {selectedWorkflow.steps.map((step, i) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2"
                >
                  <span className="text-[10px] text-gray-600 font-mono w-5">
                    {i + 1}
                  </span>
                  <span className="text-[10px] text-blue-400 font-medium">
                    {step.type}
                  </span>
                  <span className="text-xs text-gray-400">{step.name}</span>
                  {step.dependsOn && step.dependsOn.length > 0 && (
                    <span className="text-[10px] text-gray-600 ml-auto">
                      deps: {step.dependsOn.join(", ")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleFork(selectedWorkflow)}
                className="flex-1 bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-medium py-2 rounded-lg transition-colors"
              >
                Fork This Workflow
              </button>
              <button
                onClick={() => setSelectedWorkflow(null)}
                className="bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 text-xs px-4 py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
