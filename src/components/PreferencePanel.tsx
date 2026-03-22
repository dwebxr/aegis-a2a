"use client";

import { useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";

export function PreferencePanel() {
  const { preferences, addPreference, removePreference, clearAll } =
    usePreferences();
  const [newTopic, setNewTopic] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim()) return;
    await addPreference(newTopic.trim());
    setNewTopic("");
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/60 rounded-2xl p-5 shadow-lg shadow-black/20">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
          Interests
        </h3>
        {preferences.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-gray-600 hover:text-red-400 transition-colors">
            Clear
          </button>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          placeholder="Add topic..."
          className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-shadow"
        />
        <button
          type="submit"
          className="bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 w-9 h-9 rounded-lg text-lg transition-colors flex items-center justify-center"
        >
          +
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {preferences.map((pref) => (
          <span key={pref.id} className="flex items-center gap-1 bg-gray-800/60 border border-gray-700/30 text-gray-400 px-2.5 py-1 rounded-lg text-xs">
            {pref.topic}
            <button onClick={() => removePreference(pref.id)} className="text-gray-600 hover:text-red-400 ml-0.5 transition-colors">&times;</button>
          </span>
        ))}
        {preferences.length === 0 && (
          <span className="text-gray-600 text-xs">Add topics to personalize your feed.</span>
        )}
      </div>

      <p className="text-[10px] text-gray-700 mt-3 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        On-device only
      </p>
    </div>
  );
}
