'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Archive, RotateCcw, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/overlay';
import { TextInput } from '@/components/ui/field';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import type { Student } from '@/lib/types/database';
import { archiveStudent, restoreStudent } from '@/server/actions/students';

export interface StudentRow extends Student {
  class: { id: string; name: string } | null;
}

const STATUS_TONES = {
  active: 'success',
  graduated: 'info',
  transferred: 'neutral',
  withdrawn: 'warning',
} as const;

export function StudentsTable({ students }: { students: StudentRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [archiving, setArchiving] = useState<StudentRow | null>(null);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  if (students.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No students match this view"
        description="Adjust the filters, register a student, or import a class roster."
        action={
          <Button onClick={() => router.push('/students/new')}>
            Register a student
          </Button>
        }
      />
    );
  }

  function confirmArchive() {
    if (!archiving) return;
    const student = archiving;

    startTransition(async () => {
      const result = await archiveStudent(student.id, reason);
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast(`${student.first_name} ${student.last_name} archived`, 'success');
      setArchiving(null);
      setReason('');
      router.refresh();
    });
  }

  function restore(student: StudentRow) {
    startTransition(async () => {
      const result = await restoreStudent(student.id);
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast(`${student.first_name} ${student.last_name} restored`, 'success');
      router.refresh();
    });
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">School roster with class, guardian and status.</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Student</th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Class</th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Guardian</th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Admitted</th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <Link
                    href={`/students/${student.id}`}
                    className="font-medium text-slate-900 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    {student.last_name} {student.first_name}
                  </Link>
                  <span className="block text-xs text-slate-500">{student.admission_number}</span>
                </th>
                <td className="px-4 py-3 text-slate-600">{student.class?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {student.guardian_name ?? '—'}
                  {student.guardian_phone && (
                    <span className="block text-xs text-slate-400">{student.guardian_phone}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(student.admitted_on)}</td>
                <td className="px-4 py-3">
                  {student.archived_at ? (
                    <Badge tone="neutral">Archived</Badge>
                  ) : (
                    <Badge tone={STATUS_TONES[student.status]} className="capitalize">
                      {student.status}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {student.archived_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore(student)}
                      disabled={pending}
                      aria-label={`Restore ${student.first_name} ${student.last_name}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Restore
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setArchiving(student)}
                      aria-label={`Archive ${student.first_name} ${student.last_name}`}
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title="Archive student"
        description={
          archiving
            ? `${archiving.last_name} ${archiving.first_name} will be hidden from rosters. Their ledger and receipts are kept.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArchiving(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmArchive} loading={pending}>
              Archive student
            </Button>
          </div>
        }
      >
        <TextInput
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Transferred to another school"
          hint="Stored on the record for audit purposes"
        />
      </Modal>
    </>
  );
}
