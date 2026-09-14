export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 999;

/**
 * What a quantity box is allowed to contain while it is being typed in.
 *
 * An empty box is a legitimate intermediate state: clearing "1" before typing
 * "5" must leave the field blank, otherwise the digit reappears under the
 * caret and the clerk has to fight it. Nothing is coerced until the value is
 * committed.
 */
export function sanitiseQuantityInput(raw: string): string {
  // Digits only, and never long enough to overflow the smallint column.
  return raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 3);
}

/** Coerce a typed value to the quantity that will actually be stored. */
export function commitQuantity(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return MIN_QUANTITY;
  return Math.min(Math.max(parsed, MIN_QUANTITY), MAX_QUANTITY);
}
