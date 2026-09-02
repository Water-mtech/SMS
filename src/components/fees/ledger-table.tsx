'use client';

import { useMemo, useState } from 'react';
import { Pencil, Search, Wallet } from 'lucide-react';

import { LedgerEditModal } from '@/components/fees/ledger-edit-modal';
import { PaymentModal } from '@/components/fees/payment-modal';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { formatNaira } from '@/lib/format';
import type { LedgerRow } from '@/lib/types/database';

interface LedgerTableProps {
  rows: LedgerRow[];
  termId: string;
  classId: string;
  canRecordPayments: boolean;
}

/** The dual ledger for a class: arrears and current bill side by side. */
export function LedgerTable({ rows, termId, classId, canRecordPayments }: LedgerTableProps) {
  const [query, setQuery] = useState('');
  const [payingRow, setPayingRow] = useState<LedgerRow | null>(null);
  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.fullName.toLowerCase().includes(needle) ||
        row.admissionNumber.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, row) => ({
          arrears: sum.arrears + row.arrears,
          currentBill: sum.currentBill + row.currentBill,
          totalPaid: sum.totalPaid + row.totalPaid,
          balance: sum.balance + row.balance,
        }),
        { arrears: 0, currentBill: 0, totalPaid: 0, balance: 0 },
      ),
    [filtered],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-8 w-8" />}
        title="No students on this ledger"
        description="Register students in this class, or publish a fee structure to open their accounts."
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this class"
            aria-label="Search students on this ledger"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <p className="text-sm text-slate-500">
          {filtered.length} student{filtered.length === 1 ? '' : 's'} ·{' '}
          <span className="font-medium text-slate-700">{formatNaira(totals.balance)}</span> outstanding
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Fee ledger showing arrears, the current term bill, payments received and the balance for
            each student.
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Student</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Arrears</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">This term</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Paid</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Balance</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const cleared = row.balance <= 0;
              return (
                <tr key={row.studentId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="block font-medium text-slate-900">{row.fullName}</span>
                    <span className="block text-xs text-slate-500">{row.admissionNumber}</span>
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatNaira(row.arrears)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatNaira(row.currentBill)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {formatNaira(row.totalPaid)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {cleared ? (
                      <Badge tone="success">Cleared</Badge>
                    ) : (
                      <span className="font-semibold text-slate-900">{formatNaira(row.balance)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {canRecordPayments && (
                        <Button
                          size="sm"
                          variant={cleared ? 'outline' : 'primary'}
                          disabled={cleared}
                          onClick={() => setPayingRow(row)}
                          aria-label={`Record a payment for ${row.fullName}`}
                        >
                          Pay
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingRow(row)}
                        aria-label={`Adjust the ledger for ${row.fullName}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <th scope="row" className="px-4 py-3 text-left">Total</th>
              <td className="px-4 py-3 text-right tabular-nums">{formatNaira(totals.arrears)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNaira(totals.currentBill)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNaira(totals.totalPaid)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNaira(totals.balance)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <PaymentModal
        open={payingRow !== null}
        row={payingRow}
        termId={termId}
        onClose={() => setPayingRow(null)}
      />
      <LedgerEditModal
        open={editingRow !== null}
        row={editingRow}
        termId={termId}
        classId={classId}
        onClose={() => setEditingRow(null)}
      />
    </>
  );
}
