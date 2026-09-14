'use client';

import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';
import { supabaseFetch } from '@/lib/supabase/fetch';
import type { Database } from '@/lib/types/database';

/** Browser-side Supabase client. Safe to call repeatedly; the SDK memoises. */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    global: { fetch: supabaseFetch },
  });
}
