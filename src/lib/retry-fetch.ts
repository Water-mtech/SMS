/**
 * A `fetch` wrapper that retries transient failures.
 *
 * Supabase sits behind the network, so a page that issues half a dozen reads
 * will occasionally meet a dropped connection, a cold PostgREST worker or a
 * 503 while the database is busy. Without a retry a single blip throws, and one
 * failed read takes down the whole page render — the "works, but crashes
 * sometimes" failure mode.
 *
 * SAFETY: only idempotent requests are retried. PostgREST sends reads as GET
 * and mutating RPCs (recording a payment, promoting a class) as POST; replaying
 * a POST that actually succeeded but whose response was lost would double-apply
 * it. A POST is therefore attempted exactly once, always.
 */

/** Statuses worth another attempt: the request never reached a decision. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface RetryFetchOptions {
  /** Total attempts including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  fetchImpl?: typeof fetch;
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  return method.toUpperCase();
}

/**
 * `Retry-After` may be seconds or an HTTP date. Honour it when the server sends
 * one, but never wait longer than our own ceiling — a page render cannot sit
 * behind a 120-second backoff.
 */
export function parseRetryAfter(value: string | null, maxDelayMs: number): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxDelayMs);
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;

  return Math.min(Math.max(date - Date.now(), 0), maxDelayMs);
}

export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  // Full jitter, so parallel reads that fail together do not retry in lockstep.
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export function createRetryFetch(options: RetryFetchOptions = {}): typeof fetch {
  const {
    attempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 2000,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
    fetchImpl,
    onRetry,
  } = options;

  return async function retryingFetch(input: RequestInfo | URL, init?: RequestInit) {
    const doFetch = fetchImpl ?? fetch;
    const retryable = IDEMPOTENT_METHODS.has(methodOf(input, init));
    const maxAttempts = retryable ? Math.max(attempts, 1) : 1;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const isLast = attempt === maxAttempts;

      try {
        const response = await doFetch(input, init);

        if (!RETRYABLE_STATUSES.has(response.status) || isLast) {
          return response;
        }

        const delayMs =
          parseRetryAfter(response.headers.get('retry-after'), maxDelayMs) ??
          backoffDelay(attempt, baseDelayMs, maxDelayMs, random);

        // Release the discarded body so the connection can be reused.
        try {
          await response.body?.cancel();
        } catch {
          // Already consumed or unsupported; nothing to release.
        }

        onRetry?.({ attempt, delayMs, reason: `HTTP ${response.status}` });
        await sleep(delayMs);
      } catch (error) {
        // A thrown fetch is a transport failure: DNS, reset, abort, timeout.
        lastError = error;
        if (isLast) throw error;

        const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
        onRetry?.({
          attempt,
          delayMs,
          reason: error instanceof Error ? error.message : 'network error',
        });
        await sleep(delayMs);
      }
    }

    // Unreachable: the final attempt either returns or throws above.
    throw lastError ?? new Error('Request failed after retries');
  };
}
