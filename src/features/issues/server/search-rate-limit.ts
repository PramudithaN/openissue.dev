const requestTimestamps = new Map<string, number[]>();
const REQUEST_LIMIT = 6;
const WINDOW_MS = 60_000;

export function isSearchRateLimited(key: string) {
  const now = Date.now();
  const recentTimestamps = (requestTimestamps.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );

  if (recentTimestamps.length >= REQUEST_LIMIT) return true;

  recentTimestamps.push(now);
  requestTimestamps.set(key, recentTimestamps);
  return false;
}
