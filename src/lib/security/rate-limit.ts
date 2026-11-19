/**
 * A small in-memory sliding-window limiter for Server Actions.
 *
 * It is a first line of defence only: state lives in one server process, so it resets on deploy
 * and is per instance when the web app scales out. The authoritative limits are in the database
 * (see supabase/migrations/20261120000200_hardening.sql), which every instance shares.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly options: {
      /** Attempts allowed per key inside the window. */
      limit: number;
      windowMs: number;
      /** Keys remembered at once; the least recently used key is evicted beyond this. */
      maxKeys?: number;
      now?: () => number;
    },
  ) {}

  /**
   * Records an attempt for `key` if it is allowed. Returns 0 when allowed, otherwise the number
   * of milliseconds until the oldest attempt in the window expires.
   */
  take(key: string): number {
    const now = (this.options.now ?? Date.now)();
    const since = now - this.options.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    // Re-insert so Map iteration order tracks recency for eviction.
    this.hits.delete(key);
    if (recent.length >= this.options.limit) {
      this.hits.set(key, recent);
      return Math.max(1, (recent[0] ?? now) + this.options.windowMs - now);
    }
    recent.push(now);
    this.hits.set(key, recent);
    const maxKeys = this.options.maxKeys ?? 10_000;
    while (this.hits.size > maxKeys) {
      const oldest = this.hits.keys().next();
      if (oldest.done) break;
      this.hits.delete(oldest.value);
    }
    return 0;
  }
}

/** "about 4 minutes", "about 1 minute", "a few seconds": for messages people read. */
export function describeWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (ms < 45_000) return "a few seconds";
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
