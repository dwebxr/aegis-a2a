"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useLocalLLM } from "@/hooks/useLocalLLM";
import { truncateAddress } from "@/lib/utils";

const STATUS_INDICATOR: Record<string, string> = {
  idle: "bg-gray-500",
  loading: "bg-yellow-500 animate-pulse",
  ready: "bg-green-500",
  ollama: "bg-blue-500",
  "keyword-only": "bg-orange-500",
  error: "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  idle: "Initializing...",
  loading: "Loading model...",
  ready: "WebLLM Ready",
  ollama: "Ollama Connected",
  "keyword-only": "Keyword Matching",
  error: "Unavailable",
};

export function AgentStatus() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const llmStatus = useLocalLLM();

  const handleConnect = () => {
    const injected = connectors.find((c) => c.id === "injected");
    if (injected) connect({ connector: injected });
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/60 rounded-2xl p-5 shadow-lg shadow-black/20">
      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-4">
        Status
      </h3>

      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ring-2 ${isConnected ? "bg-green-500 ring-green-500/30" : "bg-gray-500 ring-gray-500/20"}`} />
          <span className="text-sm text-gray-300">
            {isConnected ? "Wallet" : "Disconnected"}
          </span>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">
              {chain?.name} &middot; {truncateAddress(address || "")}
            </span>
            <button onClick={() => disconnect()} className="text-gray-600 hover:text-red-400 transition-colors text-sm">
              &times;
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="text-xs bg-blue-600/90 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-500/20 text-white px-3 py-1.5 rounded-lg transition-all duration-200"
          >
            Connect
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_INDICATOR[llmStatus.status] || "bg-gray-500"}`} />
          <span className="text-sm text-gray-300">
            {STATUS_LABEL[llmStatus.status] || llmStatus.status}
          </span>
        </div>
        {llmStatus.error && (
          <span className="text-[10px] text-gray-600" title={llmStatus.error}>
            {llmStatus.error.length > 25 ? llmStatus.error.slice(0, 25) + "..." : llmStatus.error}
          </span>
        )}
      </div>
    </div>
  );
}
