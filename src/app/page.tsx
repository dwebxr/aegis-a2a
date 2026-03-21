"use client";

import { A2AFeed } from "@/components/A2AFeed";
import { AgentStatus } from "@/components/AgentStatus";
import { PreferencePanel } from "@/components/PreferencePanel";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Aegis <span className="text-blue-500">A2A</span>
            </h1>
            <p className="text-sm text-gray-500">
              Agent-to-Agent Information Trading
            </p>
          </div>
          <div className="text-xs text-gray-600">
            Powered by USDC &middot; Base / Solana / ICP
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-1 space-y-4">
            <AgentStatus />
            <PreferencePanel />
          </aside>

          {/* Main Feed */}
          <section className="lg:col-span-3">
            <A2AFeed />
          </section>
        </div>
      </div>
    </main>
  );
}
