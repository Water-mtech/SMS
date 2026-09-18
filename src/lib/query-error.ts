/**
 * Turning a Supabase/PostgREST failure into something an operator can act on.
 *
 * Kept out of `server/queries.ts` — which is `server-only` — so the wording can
 * be asserted in a test.
 */

/**
 * PostgrestError carries `code`, `details` and `hint` alongside `message`, and
 * those are usually the parts that identify the problem (a missing column, a
 * relationship PostgREST could not resolve). Dropping them leaves a production
 * log line that says nothing actionable, so fold them all into the message.
 */
export interface QueryError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Codes that all mean one thing to an operator: the database does not have
 * something this build of the app expects. 42P01/42703/42883 come from Postgres
 * itself; the PGRST2xx family comes from PostgREST's schema cache. Every one of
 * them is an unapplied migration — or a cache that never reloaded after one —
 * so say so, because the raw message reads like a bug in the page.
 */
const MISSING_SCHEMA_CODES = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  '42883', // undefined_function
  'PGRST200', // embedded relationship not found
  'PGRST202', // function not found in the schema cache
  'PGRST204', // column not found in the schema cache
  'PGRST205', // table not found in the schema cache
]);

export const MIGRATION_HINT =
  'The database is missing something this version of the app expects. Apply ' +
  'every file in supabase/migrations, in filename order, then reload the schema ' +
  "cache (Supabase: Settings → API → Reload schema cache, or `notify pgrst, 'reload schema'`).";

/** True when the failure is a missing table, column, function or relationship. */
export function isMissingSchema(error: QueryError | null): boolean {
  return Boolean(error?.code && MISSING_SCHEMA_CODES.has(error.code));
}

export function describeQueryError(error: QueryError | null): string {
  // supabase-js hands back a bare `{}` when the response was not the JSON it
  // expected -- a gateway 404 or an HTML error page. Saying "unknown error" is
  // little, but it beats a context line ending in a colon and nothing.
  if (!error?.message) return error?.code ? `unknown error (code ${error.code})` : 'unknown error';
  const parts = [error.message];
  if (error.code) parts.push(`(code ${error.code})`);
  if (error.details) parts.push(`— ${error.details}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  if (isMissingSchema(error)) parts.push(`— ${MIGRATION_HINT}`);
  return parts.join(' ');
}
