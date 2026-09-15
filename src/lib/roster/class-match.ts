/**
 * Matching spreadsheet class labels to configured classes.
 *
 * Schools write the same class a dozen ways — "SSS1", "SS 1", "Senior Secondary 1",
 * "PRE- NURSERY", "Pry 3". Both the label in the file and the class name in the
 * database are reduced to one canonical key so they can be compared directly.
 */

/** Stems that mean the same rung of the ladder, mapped to the canonical one. */
const STEM_ALIASES: Record<string, string> = {
  PRENURSERY: 'PRENURSERY',
  PRENURSER: 'PRENURSERY',
  PRENUR: 'PRENURSERY',
  PRENSY: 'PRENURSERY',
  NURSERY: 'NURSERY',
  NURSREY: 'NURSERY',
  NUR: 'NURSERY',
  NSY: 'NURSERY',
  PRIMARY: 'PRIMARY',
  PRIMAY: 'PRIMARY',
  PRY: 'PRIMARY',
  PRI: 'PRIMARY',
  P: 'PRIMARY',
  JSS: 'JSS',
  JS: 'JSS',
  JUNIORSECONDARY: 'JSS',
  JUNIORSECONDARYSCHOOL: 'JSS',
  SS: 'SS',
  SSS: 'SS',
  SENIORSECONDARY: 'SS',
  SENIORSECONDARYSCHOOL: 'SS',
};

/**
 * Reduce a class label to a comparable key: strip punctuation and spacing, then
 * fold the alphabetic stem through the alias table, keeping the year number.
 *
 * `"SSS1"`, `"SS 1"` and `"Senior Secondary 1"` all collapse to `"SS1"`.
 */
export function classKey(label: string): string {
  const compact = label.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';

  // Letters then an optional year: anything else (an arm suffix, a nickname) is
  // left alone so it can only ever match an identically spelled class.
  const parts = compact.match(/^([A-Z]+)(\d*)$/);
  if (!parts) return compact;

  const [, stem = '', year = ''] = parts;
  return `${STEM_ALIASES[stem] ?? stem}${year}`;
}

export interface MatchableClass {
  id: string;
  name: string;
}

/**
 * Index configured classes by canonical key. Two classes that collapse to the
 * same key would be ambiguous, so the first one wins and the duplicate is
 * simply unreachable by label — deliberate, since guessing would be worse.
 */
export function classIndex<T extends MatchableClass>(classes: readonly T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of classes) {
    const key = classKey(item.name);
    if (key && !index.has(key)) index.set(key, item);
  }
  return index;
}

/** Find the configured class a spreadsheet label refers to, or `null`. */
export function matchClass<T extends MatchableClass>(
  label: string,
  index: Map<string, T>,
): T | null {
  const key = classKey(label);
  if (!key) return null;
  return index.get(key) ?? null;
}
