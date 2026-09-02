/** Discriminated result returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function failure<T = never>(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/**
 * Postgres errors carry the message we raised in the RPC. Surface it directly —
 * the functions were written to produce operator-readable text — but strip the
 * internal context Supabase appends.
 */
export function fromPostgrestError(error: { message: string; details?: string | null }): string {
  const [firstLine] = error.message.split('\n');
  return (firstLine ?? error.message).replace(/^ERROR:\s*/i, '').trim();
}

/** Collapse a Zod error into one message per field, for inline form display. */
export function fieldErrorsOf(error: { issues: { path: (string | number)[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
