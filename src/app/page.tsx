"use client";

import { useState } from "react";
import { usePolicy } from "@/hooks/usePolicy";
import { A2AFeed } from "@/components/A2AFeed";
import { AgentStatus } from "@/components/AgentStatus";
import { PreferencePanel } from "@/components/PreferencePanel";
import { PolicyBuilder } from "@/components/PolicyBuilder";
import { IdentityPanel } from "@/components/IdentityPanel";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { WorkflowMarketplace } from "@/components/WorkflowMarketplace";

type MainTab = "feed" | "activity" | "workflows";

export default function Home() {
  const [mainTab, setMainTab] = useState<MainTab>("feed");
  const { activePolicy } = usePolicy();

  return (
    <main className="min-h-screen bg-black">
      <header className="bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Aegis <span className="text-blue-400">A2A</span>
              </h1>
              <p className="text-[11px] text-gray-500">Agent-to-Agent Information Trading</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-gray-800/50 border border-gray-700/30 rounded-full px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[11px] text-gray-400">USDC &middot; Base / Solana / ICP</span>
          </div>
        </div>
      </header>
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
            <AgentStatus />
            <PreferencePanel />
            <PolicyBuilder />
            <IdentityPanel />
          </aside>
          <section>
            {/* Main tab switcher */}
            <div className="flex gap-1 bg-gray-900/80 border border-gray-800/50 rounded-xl p-1 mb-6 w-fit">
              {([
                { key: "feed" as const, label: "Offers" },
                { key: "activity" as const, label: "Activity" },
                { key: "workflows" as const, label: "Workflows" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMainTab(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    mainTab === key
                      ? "bg-gray-700/80 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mainTab === "feed" && <A2AFeed policyRules={activePolicy?.rules} />}
            {mainTab === "activity" && <ActivityTimeline />}
            {mainTab === "workflows" && <WorkflowMarketplace />}
          </section>
        </div>
      </div>
    </main>
  );
}
