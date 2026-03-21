const hits = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const CLEANUP_INTERVAL = 100; // run full cleanup every N calls
let callCount = 0;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Lazy cleanup: prune all stale keys periodically
  if (++callCount >= CLEANUP_INTERVAL) {
    callCount = 0;
    hits.forEach((ts, k) => {
      if (ts.length === 0 || ts[ts.length - 1] < windowStart) {
        hits.delete(k);
      }
    });
  }

  let timestamps = hits.get(key);
  if (!timestamps) {
    timestamps = [];
    hits.set(key, timestamps);
  }

  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= MAX_REQUESTS) {
    return true;
  }

  timestamps.push(now);
  return false;
}
