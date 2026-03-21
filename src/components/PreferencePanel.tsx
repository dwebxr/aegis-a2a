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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Preferences
        </h3>
        {preferences.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Clear All
          </button>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          placeholder="Add interest topic..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm"
        >
          Add
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {preferences.map((pref) => (
          <span
            key={pref.id}
            className="flex items-center gap-1 bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-sm"
          >
            {pref.topic}
            <button
              onClick={() => removePreference(pref.id)}
              className="text-gray-500 hover:text-red-400 ml-1"
            >
              &times;
            </button>
          </span>
        ))}
        {preferences.length === 0 && (
          <span className="text-gray-600 text-sm">
            No preferences set. Add topics to personalize your feed.
          </span>
        )}
      </div>

      <p className="text-xs text-gray-600 mt-3">
        All preference data stays on your device. Never sent to any server.
      </p>
    </div>
  );
}
