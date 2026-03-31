"use client";

import { useActivityFeed } from "@/hooks/useActivityFeed";
import { ActivityEventCard } from "./ActivityEvent";

export function ActivityTimeline() {
  const { events, isLoading, error, isStale, refetch } = useActivityFeed(30);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-300 tracking-tight">
          Activity
        </h2>
        <button
          onClick={refetch}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="text-center text-red-400/80 text-xs py-6">
          {error}{" "}
          <button onClick={refetch} className="underline">
            Retry
          </button>
        </div>
      )}

      {isStale && (
        <div className="text-[10px] text-amber-400/80 bg-amber-900/20 rounded-lg px-3 py-1.5 mb-3">
          Feed may be outdated.{" "}
          <button onClick={refetch} className="underline">Refresh</button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-8">
              No activity yet
            </div>
          ) : (
            events.map((event) => (
              <ActivityEventCard key={event.id} event={event} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
