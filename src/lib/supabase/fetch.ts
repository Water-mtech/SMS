import { createRetryFetch } from '@/lib/retry-fetch';

/**
 * The fetch every Supabase client uses.
 *
 * Three attempts with a short, jittered backoff: enough to ride out a dropped
 * connection or a busy PostgREST worker, short enough that a page render never
 * stalls noticeably. Writes are excluded by the wrapper itself — only GET and
 * HEAD are ever replayed.
 */
export const supabaseFetch = createRetryFetch({
  attempts: 3,
  baseDelayMs: 150,
  maxDelayMs: 1500,
});
