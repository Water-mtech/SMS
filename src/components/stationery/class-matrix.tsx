'use client';

import { useMemo, useState } from 'react';
import { Check, PackageOpen } from 'lucide-react';

import { StudentStationeryDrawer } from '@/components/stationery/student-drawer';
import { Badge, EmptyState } from '@/components/ui/primitives';
import type { StationeryItem } from '@/lib/types/database';
import { cn } from '@/lib/utils';

export interface MatrixStudent {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  issuedItemIds: string[];
}

interface ClassMatrixProps {
  students: MatrixStudent[];
  items: StationeryItem[];
  termId: string;
  className: string;
}

/**
 * Students down the rows, stationery items across the columns.
 *
 * Issued cells show a green check, un-issued cells a dash. The whole grid is
 * kept in client state so a save in the drawer updates the row instantly
 * without a round trip to re-render the page.
 */
export function ClassMatrix({ students, items, termId, className }: ClassMatrixProps) {
  const [issued, setIssued] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(students.map((student) => [student.studentId, new Set(student.issuedItemIds)])),
  );
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  const activeStudent = students.find((student) => student.studentId === activeStudentId) ?? null;

  const totals = useMemo(() => {
    const perItem = new Map<string, number>();
    let complete = 0;

    for (const student of students) {
      const set = issued[student.studentId] ?? new Set<string>();
      for (const itemId of set) perItem.set(itemId, (perItem.get(itemId) ?? 0) + 1);
      if (items.length > 0 && items.every((item) => set.has(item.id))) complete += 1;
    }

    return { perItem, complete };
  }, [students, items, issued]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="h-8 w-8" />}
        title="No stationery items for this section"
        description="Add items to this section before tracking what each student has received."
      />
    );
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="h-8 w-8" />}
        title={`No active students in ${className}`}
        description="Register students or import a roster to start tracking stationery."
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 text-sm">
        <Badge tone="success">
          {totals.complete} of {students.length} fully issued
        </Badge>
        <span className="text-slate-500">
          Select a student to update what they have collected.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Stationery issued to each student in {className}. A check means the item has been
            collected; a dash means it has not.
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th
                scope="col"
                className="matrix-sticky-cell min-w-56 border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700"
              >
                Student
              </th>
              {items.map((item) => (
                <th
                  key={item.id}
                  scope="col"
                  className="min-w-28 px-3 py-3 text-center align-bottom font-semibold text-slate-700"
                >
                  <span className="block leading-tight">{item.name}</span>
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    {totals.perItem.get(item.id) ?? 0}/{students.length}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const set = issued[student.studentId] ?? new Set<string>();
              const count = items.filter((item) => set.has(item.id)).length;

              return (
                <tr key={student.studentId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <th scope="row" className="matrix-sticky-cell border-r border-slate-200 px-4 py-2.5 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setActiveStudentId(student.studentId)}
                      className="flex w-full flex-col items-start rounded-md px-1 py-0.5 text-left transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      aria-label={`Update stationery for ${student.fullName}. ${count} of ${items.length} items issued.`}
                    >
                      <span className="font-medium text-slate-900">{student.fullName}</span>
                      <span className="text-xs text-slate-500">
                        {student.admissionNumber} · {count}/{items.length} issued
                      </span>
                    </button>
                  </th>

                  {items.map((item) => {
                    const isIssued = set.has(item.id);
                    return (
                      <td key={item.id} className="px-3 py-2.5 text-center">
                        {isIssued ? (
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                            title={`${item.name}: issued`}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Issued</span>
                          </span>
                        ) : (
                          <span className={cn('text-slate-300')} title={`${item.name}: not issued`}>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Not issued</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <StudentStationeryDrawer
        open={activeStudent !== null}
        student={activeStudent}
        items={items}
        termId={termId}
        selectedItemIds={activeStudent ? (issued[activeStudent.studentId] ?? new Set()) : new Set()}
        onClose={() => setActiveStudentId(null)}
        onSaved={(studentId, itemIds) =>
          setIssued((current) => ({ ...current, [studentId]: new Set(itemIds) }))
        }
      />
    </>
  );
}
