import { z } from 'zod';

/**
 * Environment access is centralised so a missing variable fails at boot with a
 * readable message instead of surfacing as `undefined` deep inside a query.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
});

// Next.js inlines `process.env.NEXT_PUBLIC_*` only for statically written
// references, so they must be spelled out rather than looped over.
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export const school = {
  name: process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'Bright Future International School',
  address: process.env.NEXT_PUBLIC_SCHOOL_ADDRESS ?? '12 Ahmadu Bello Way, Kaduna, Nigeria',
  phone: process.env.NEXT_PUBLIC_SCHOOL_PHONE ?? '+234 800 000 0000',
} as const;

/** Server-only. Throws if read from a bundle that reaches the browser. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for administrative operations');
  }
  return key;
}
