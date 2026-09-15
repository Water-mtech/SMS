import { classIndex, matchClass, type MatchableClass } from './class-match';
import type { ParsedImportRow, RowError } from './import';

/** One class's share of an import, ready to be sent to the RPC. */
export interface ClassGroup<T extends MatchableClass = MatchableClass> {
  target: T;
  rows: ParsedImportRow[];
}

export interface GroupedImport<T extends MatchableClass = MatchableClass> {
  groups: ClassGroup<T>[];
  /** Rows naming a class that is not configured. These are never imported. */
  unmatched: RowError[];
}

/**
 * Split parsed rows into per-class batches.
 *
 * A row's own `class` column wins; rows without one fall back to `fallback`,
 * the class picked on screen. A row naming a class the school has not
 * configured is rejected outright rather than being guessed into the fallback —
 * silently filing a child under the wrong class is the one failure that would
 * be hard to notice and tedious to undo.
 */
export function groupRowsByClass<T extends MatchableClass>(
  rows: readonly ParsedImportRow[],
  classes: readonly T[],
  fallback: T | null,
): GroupedImport<T> {
  const index = classIndex(classes);
  const byClassId = new Map<string, ClassGroup<T>>();
  const unmatched: RowError[] = [];

  for (const row of rows) {
    const label = row.class_name?.trim();
    const target = label ? matchClass(label, index) : fallback;

    if (!target) {
      unmatched.push({
        line: row.line,
        message: label
          ? `No class named "${label}" is set up — fix the spelling or add the class first`
          : 'No class on this row and none selected above',
      });
      continue;
    }

    const group = byClassId.get(target.id);
    if (group) group.rows.push(row);
    else byClassId.set(target.id, { target, rows: [row] });
  }

  // Order groups the way the classes are configured, so the summary reads like
  // the school's own ladder rather than the order rows happened to appear in.
  const order = new Map(classes.map((item, position) => [item.id, position]));
  const groups = [...byClassId.values()].sort(
    (a, b) => (order.get(a.target.id) ?? 0) - (order.get(b.target.id) ?? 0),
  );

  return { groups, unmatched };
}

/** What a multi-class import actually did, per class and overall. */
export interface BulkImportSummary {
  imported: number;
  skipped: number;
  perClass: { className: string; imported: number; skipped: number }[];
  /** Classes whose batch failed. Everything else still landed. */
  failed: { className: string; message: string }[];
}
