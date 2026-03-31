"use client";

import { useState, useCallback } from "react";
import { usePolicy } from "@/hooks/usePolicy";
import { generateId } from "@/lib/utils";
import type { PolicyDocument, PolicyRule } from "@/types/policy";

const RULE_TYPE_LABELS: Record<string, string> = {
  vcl_threshold: "VCL Threshold",
  rate_limit: "Rate Limit",
  chain_restrict: "Chain Restrict",
  price_cap: "Price Cap",
  agent_allowlist: "Agent Allowlist",
  agent_blocklist: "Agent Blocklist",
  topic_filter: "Topic Filter",
};

function RulePreview({ rule }: { rule: PolicyRule }) {
  const label = RULE_TYPE_LABELS[rule.type] || rule.type;
  const params = Object.entries(rule.params)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("; ");

  return (
    <div className="flex items-center gap-2 text-[11px] bg-gray-800/60 border border-gray-700/30 rounded-lg px-2.5 py-1.5">
      <span className="text-blue-400 font-medium">{label}</span>
      <span className="text-gray-500">{params}</span>
    </div>
  );
}

export function PolicyBuilder() {
  const {
    policies,
    activePolicy,
    isCompiling,
    compileError,
    compile,
    savePolicy,
    removePolicy,
    activate,
  } = usePolicy();

  const [input, setInput] = useState("");
  const [previewRules, setPreviewRules] = useState<PolicyRule[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const handleCompile = useCallback(async () => {
    if (!input.trim()) return;
    setValidationErrors([]);
    setValidationWarnings([]);
    const rules = await compile(input);

    if (rules.length === 0) {
      setValidationErrors(["No rules could be extracted from the input"]);
      return;
    }

    // Validate
    const { validatePolicy } = await import("@/services/policy/validator");
    const result = validatePolicy(rules);
    setValidationErrors(result.errors);
    setValidationWarnings(result.warnings);
    if (result.valid) {
      setPreviewRules(rules);
    }
  }, [input, compile]);

  const handleSave = useCallback(() => {
    if (previewRules.length === 0) return;
    const doc: PolicyDocument = {
      id: generateId(),
      name: input.slice(0, 50),
      naturalLanguage: input,
      rules: previewRules,
      compiledAt: Date.now(),
      version: 1,
    };
    savePolicy(doc);
    activate(doc.id);
    setInput("");
    setPreviewRules([]);
  }, [input, previewRules, savePolicy, activate]);

  return (
    <div className="bg-gray-900/60 border border-gray-800/50 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-gray-300 tracking-tight">
          Security Policy
        </h3>
        {activePolicy && (
          <span className="text-[10px] bg-green-900/50 text-green-400 px-2 py-0.5 rounded-md">
            Active
          </span>
        )}
      </div>

      {/* Input */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='e.g. "VCL score above 8, Base chain only, max 10 requests per minute"'
        className="w-full bg-gray-800/50 border border-gray-700/30 rounded-xl px-3 py-2 text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
        rows={3}
      />

      {/* Compile button */}
      <button
        onClick={handleCompile}
        disabled={isCompiling || !input.trim()}
        className="mt-2 w-full bg-blue-600/80 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
      >
        {isCompiling ? "Compiling..." : "Compile Policy"}
      </button>

      {/* Errors */}
      {(compileError || validationErrors.length > 0) && (
        <div className="mt-2 space-y-1">
          {compileError && (
            <p className="text-[10px] text-red-400">{compileError}</p>
          )}
          {validationErrors.map((err, i) => (
            <p key={i} className="text-[10px] text-red-400">{err}</p>
          ))}
        </div>
      )}

      {/* Warnings (policy is still valid but has potential issues) */}
      {validationWarnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {validationWarnings.map((warn, i) => (
            <p key={i} className="text-[10px] text-yellow-500/70">
              Warning: {warn}
            </p>
          ))}
        </div>
      )}

      {/* Preview */}
      {previewRules.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] text-gray-500 mb-1">Compiled rules:</p>
          {previewRules.map((rule, i) => (
            <RulePreview key={i} rule={rule} />
          ))}
          <button
            onClick={handleSave}
            className="mt-2 w-full bg-green-700/60 hover:bg-green-600/80 text-green-200 text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            Save &amp; Activate
          </button>
        </div>
      )}

      {/* Saved policies */}
      {policies.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-[10px] text-gray-600">Saved policies:</p>
          {policies.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                activePolicy?.id === p.id
                  ? "bg-blue-900/30 border-blue-700/30 text-blue-300"
                  : "bg-gray-800/40 border-gray-700/20 text-gray-500"
              }`}
            >
              <button
                onClick={() => activate(activePolicy?.id === p.id ? null : p.id)}
                className="flex-1 text-left truncate"
              >
                {p.name}
                <span className="text-[10px] text-gray-600 ml-1">
                  ({p.rules.length} rules)
                </span>
              </button>
              <button
                onClick={() => removePolicy(p.id)}
                className="text-gray-600 hover:text-red-400 ml-2 transition-colors"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-700 mt-3">
        Policies are stored locally and applied as client-side filters.
      </p>
    </div>
  );
}
