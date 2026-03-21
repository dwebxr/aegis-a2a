"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useLocalLLM } from "@/hooks/useLocalLLM";
import { truncateAddress } from "@/lib/utils";

const STATUS_INDICATOR: Record<string, string> = {
  idle: "bg-gray-500",
  loading: "bg-yellow-500 animate-pulse",
  ready: "bg-green-500",
  fallback: "bg-yellow-500",
  error: "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  idle: "Initializing...",
  loading: "Loading model...",
  ready: "WebLLM Ready",
  fallback: "Ollama Fallback",
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Status
      </h3>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-500"}`} />
          <span className="text-sm text-gray-300">
            {isConnected ? "Wallet Connected" : "Wallet Disconnected"}
          </span>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {chain?.name} &middot; {truncateAddress(address || "")}
            </span>
            <button onClick={() => disconnect()} className="text-xs text-red-400 hover:text-red-300">
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded"
          >
            Connect MetaMask
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_INDICATOR[llmStatus.status]}`} />
          <span className="text-sm text-gray-300">
            LLM: {STATUS_LABEL[llmStatus.status]}
          </span>
        </div>
        {llmStatus.error && (
          <span className="text-xs text-yellow-500" title={llmStatus.error}>
            {llmStatus.status === "fallback" ? "WebGPU N/A" : "Error"}
          </span>
        )}
      </div>
    </div>
  );
}
