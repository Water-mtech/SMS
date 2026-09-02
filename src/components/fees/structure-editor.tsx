'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatNaira, toAmount } from '@/lib/format';
import { upsertFeeStructure } from '@/server/actions/fees';

export interface StructureRow {
  classId: string;
  className: string;
  sectionName: string;
  amount: number;
  description: string | null;
}

/**
 * Per-class fee structure for a term. Saving a row publishes the amount and
 * immediately re-applies it across that class's ledger.
 */
export function StructureEditor({ rows, termId }: { rows: StructureRow[]; termId: string }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.classId, String(row.amount)])),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Fee amount charged to each class this term.</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Class</th>
            <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Section</th>
            <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Current</th>
            <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Amount for this term</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <StructureRowForm
              key={row.classId}
              row={row}
              termId={termId}
              value={drafts[row.classId] ?? '0'}
              onChange={(value) => setDrafts((current) => ({ ...current, [row.classId]: value }))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StructureRowForm({
  row,
  termId,
  value,
  onChange,
}: {
  row: StructureRow;
  termId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const dirty = toAmount(value) !== row.amount;

  function save() {
    const formData = new FormData();
    formData.set('classId', row.classId);
    formData.set('termId', termId);
    formData.set('amount', String(toAmount(value)));

    startTransition(async () => {
      const result = await upsertFeeStructure(formData);
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast(`${row.className}: applied to ${result.data.applied} account(s)`, 'success');
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
        {row.className}
      </th>
      <td className="px-4 py-3 text-slate-500">{row.sectionName}</td>
      <td className="px-4 py-3 tabular-nums text-slate-600">{formatNaira(row.amount)}</td>
      <td className="px-4 py-3">
        <label className="sr-only" htmlFor={`amount-${row.classId}`}>
          Fee amount for {row.className}
        </label>
        <input
          id={`amount-${row.classId}`}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-36 rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" variant={dirty ? 'primary' : 'outline'} onClick={save} loading={pending}>
          Save
        </Button>
      </td>
    </tr>
  );
}
