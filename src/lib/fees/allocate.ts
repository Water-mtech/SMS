/**
 * Splitting one family payment across several children.
 *
 * A parent hands over a single sum for the whole household. The ledger is per
 * pupil, so that sum has to be broken up before it can be recorded. The split
 * proposed here is only a starting point — the bursar can override any line
 * before saving, because only the parent knows whose fees the money is for.
 */

export interface AllocationTarget {
  studentId: string;
  /** What this child still owes this term. */
  balance: number;
}

export type Allocation = Record<string, number>;

/**
 * Propose how a sum should fall across the children: clear the largest debt
 * first, then spill into the next.
 *
 * Settling one child completely is what most parents ask for — a child with
 * nothing outstanding can sit an exam or collect a report — whereas spreading
 * the money thinly leaves everyone still owing. Ties break on student id so the
 * same input always proposes the same split.
 */
export function suggestAllocation(targets: readonly AllocationTarget[], amount: number): Allocation {
  const allocation: Allocation = {};
  let remaining = roundKobo(Math.max(amount, 0));

  const order = [...targets]
    .filter((target) => target.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.studentId.localeCompare(b.studentId));

  for (const target of order) {
    if (remaining <= 0) break;
    const share = Math.min(remaining, target.balance);
    allocation[target.studentId] = roundKobo(share);
    remaining = roundKobo(remaining - share);
  }

  return allocation;
}

/** Total across every line, ignoring blanks and anything unparseable. */
export function allocationTotal(allocation: Allocation): number {
  return roundKobo(Object.values(allocation).reduce((sum, value) => sum + (value || 0), 0));
}

export interface AllocationProblem {
  studentId: string;
  message: string;
}

/**
 * Check a split before it is sent. The database enforces all of this too — this
 * only spares the bursar a round trip and names the child in the message.
 */
export function validateAllocation(
  targets: readonly AllocationTarget[],
  allocation: Allocation,
  nameOf: (studentId: string) => string,
): AllocationProblem[] {
  const problems: AllocationProblem[] = [];

  for (const target of targets) {
    const value = allocation[target.studentId];
    if (value === undefined || value === 0) continue;

    if (!Number.isFinite(value) || value < 0) {
      problems.push({ studentId: target.studentId, message: `${nameOf(target.studentId)}: enter a valid amount` });
      continue;
    }

    if (roundKobo(value) > target.balance) {
      problems.push({
        studentId: target.studentId,
        message: `${nameOf(target.studentId)} owes only ${target.balance.toLocaleString('en-NG')}`,
      });
    }
  }

  return problems;
}

/** Money is stored to the kobo; keep float drift out of the totals. */
export function roundKobo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
