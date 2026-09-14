import { z } from 'zod';

/**
 * Environment access is centralised so a missing variable fails at boot with a
 * readable message instead of surfacing as `undefined` deep inside a query.
 */
// `required_error` matters as much as the min-length message: when a variable
// is simply absent, Zod reports an invalid_type issue and would otherwise say
// only "Required" against an internal field name, naming nothing actionable.
const MISSING_KEY =
  'Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the older NEXT_PUBLIC_SUPABASE_ANON_KEY)';

const publicSchema = z.object({
  supabaseUrl: z
    .string({ required_error: 'NEXT_PUBLIC_SUPABASE_URL is required' })
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  supabaseKey: z.string({ required_error: MISSING_KEY }).min(1, MISSING_KEY),
});

// Next.js inlines `process.env.NEXT_PUBLIC_*` only for statically written
// references, so both names are spelled out rather than looked up dynamically.
// Supabase renamed the browser-safe key from "anon" to "publishable"; either
// spelling is accepted so a project on the newer key still boots.
export const publicEnv = publicSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
