"use client";

import type { ActivityEvent as ActivityEventType } from "@/types/activity";

interface ActivityEventProps {
  event: ActivityEventType;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  offer_published: {
    bg: "bg-blue-900/30",
    text: "text-blue-400",
    icon: "M12 4v16m8-8H4",
  },
  offer_purchased: {
    bg: "bg-green-900/30",
    text: "text-green-400",
    icon: "M5 13l4 4L19 7",
  },
  bridge_sync: {
    bg: "bg-indigo-900/30",
    text: "text-indigo-400",
    icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  },
  content_viewed: {
    bg: "bg-gray-800/50",
    text: "text-gray-400",
    icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  },
  policy_applied: {
    bg: "bg-amber-900/30",
    text: "text-amber-400",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  },
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityEventCard({ event }: ActivityEventProps) {
  const style = TYPE_STYLES[event.type] || TYPE_STYLES.content_viewed!;

  return (
    <div className="flex gap-3 py-3 px-4 rounded-xl bg-gray-900/40 border border-gray-800/30 hover:bg-gray-900/60 transition-colors">
      {/* Icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center`}>
        <svg className={`w-4 h-4 ${style.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 leading-relaxed">{event.summary}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-600">
            {formatRelativeTime(event.timestamp)}
          </span>
          {event.chain && (
            <span className="text-[10px] text-gray-700 bg-gray-800/40 px-1.5 py-0.5 rounded">
              {event.chain}
            </span>
          )}
          {event.txHash && (
            <span className="text-[10px] text-gray-700 font-mono truncate max-w-[80px]">
              {event.txHash.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
