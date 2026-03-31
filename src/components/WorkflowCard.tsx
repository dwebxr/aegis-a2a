"use client";

import type { WorkflowTemplate } from "@/types/workflow";

interface WorkflowCardProps {
  workflow: WorkflowTemplate;
  onSelect: (workflow: WorkflowTemplate) => void;
  onFork?: (workflow: WorkflowTemplate) => void;
}

export function WorkflowCard({ workflow, onSelect, onFork }: WorkflowCardProps) {
  const avgRating =
    workflow.rating.count > 0
      ? (workflow.rating.sum / workflow.rating.count).toFixed(1)
      : "N/A";

  return (
    <div className="bg-gray-900/60 border border-gray-800/50 rounded-2xl p-4 hover:bg-gray-900/80 hover:border-gray-700/60 transition-all duration-300">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-medium text-white tracking-tight line-clamp-1">
          {workflow.name}
        </h3>
        <span className="text-[10px] bg-gray-800/60 text-gray-500 px-2 py-0.5 rounded-md flex-shrink-0 ml-2">
          {workflow.steps.length} steps
        </span>
      </div>

      <p className="text-gray-500 text-xs mb-3 line-clamp-2">
        {workflow.description || "No description"}
      </p>

      {/* Tags */}
      {workflow.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {workflow.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[10px] bg-gray-800/40 text-gray-500 px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 mb-3">
        <span className="font-mono">{workflow.author}</span>
        <span>Rating: {avgRating}</span>
      </div>

      {workflow.forkedFrom && (
        <p className="text-[10px] text-indigo-400/60 mb-2">
          Forked from {workflow.forkedFrom.slice(0, 8)}...
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onSelect(workflow)}
          className="flex-1 bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
        >
          View
        </button>
        {onFork && (
          <button
            onClick={() => onFork(workflow)}
            className="bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            Fork
          </button>
        )}
      </div>
    </div>
  );
}
