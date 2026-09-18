'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { FamilyReceipt } from '@/components/fees/family-receipt';
import { Button } from '@/components/ui/button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  allocationTotal,
  suggestAllocation,
  validateAllocation,
  roundKobo,
  type Allocation,
} from '@/lib/fees/allocate';
import type { FamilyReceiptData } from '@/lib/fees/family-receipt';
import { PAYMENT_METHOD_OPTIONS, formatNaira, toAmount, toKobo } from '@/lib/format';
import type { PaymentMethod, TermLabel } from '@/lib/types/database';
import type { FamilyChild } from '@/server/queries';
import { recordFamilyPayment } from '@/server/actions/families';

interface FamilyPaymentModalProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  familyName: string;
  pupils: FamilyChild[];
  termId: string;
  termLabel: TermLabel;
  sessionName: string;
}

/**
 * Take one payment for a whole household.
 *
 * The bursar types the total once and the split is proposed for them, largest
 * debt first; every line stays editable because only the parent knows whose
 * fees the money is meant for. The family remainder recalculates as they go, so
 * what the parent is told matches what will be written.
 */
export function FamilyPaymentModal({
  open,
  onClose,
  familyId,
  familyName,
  pupils,
  termId,
  termLabel,
  sessionName,
}: FamilyPaymentModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [totalInput, setTotalInput] = useState('');
  const [allocation, setAllocation] = useState<Allocation>({});
  // Once a line is hand-edited the suggestion stops overwriting the boxes.
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FamilyReceiptData | null>(null);
  const [pending, startTransition] = useTransition();

  const payable = useMemo(() => pupils.filter((child) => child.balance > 0), [pupils]);
  const familyDue = useMemo(
    () => roundKobo(payable.reduce((sum, child) => sum + child.balance, 0)),
    [payable],
  );

  const allocated = allocationTotal(allocation);
  const remainingToAllocate = roundKobo(toKobo(toAmount(totalInput)) - allocated);
  const familyAfter = roundKobo(familyDue - allocated);

  const nameOf = (studentId: string) =>
    payable.find((child) => child.studentId === studentId)?.fullName ?? 'This pupil';

  const problems = validateAllocation(
    payable.map((child) => ({ studentId: child.studentId, balance: child.balance })),
    allocation,
    nameOf,
  );

  /** Typing the total re-proposes the split, until a line is edited by hand. */
  function onTotalChange(value: string) {
    setTotalInput(value);
    setError(null);
    if (touched) return;
    setAllocation(
      suggestAllocation(
        payable.map((child) => ({ studentId: child.studentId, balance: child.balance })),
        toKobo(toAmount(value)),
      ),
    );
  }

  function onLineChange(studentId: string, value: string) {
    setTouched(true);
    setError(null);
    setAllocation((current) => {
      const next = { ...current };
      const amount = toKobo(toAmount(value));
      if (value.trim() === '' || amount === 0) delete next[studentId];
      else next[studentId] = amount;
      return next;
    });
  }

  function redistribute() {
    setTouched(false);
    setAllocation(
      suggestAllocation(
        payable.map((child) => ({ studentId: child.studentId, balance: child.balance })),
        toKobo(toAmount(totalInput)),
      ),
    );
  }

  function reset() {
    setTotalInput('');
    setAllocation({});
    setTouched(false);
    setMethod('cash');
    setReference('');
    setNotes('');
    setError(null);
    setReceipt(null);
  }

  function close() {
    if (receipt) router.refresh();
    reset();
    onClose();
  }

  function submit() {
    setError(null);

    const lines = Object.entries(allocation)
      .filter(([, amount]) => amount > 0)
      .map(([studentId, amount]) => ({ studentId, amount: roundKobo(amount) }));

    if (lines.length === 0) {
      setError('Enter an amount for at least one pupil');
      return;
    }
    if (problems.length > 0) {
      setError(problems[0]?.message ?? 'Check the amounts');
      return;
    }

    startTransition(async () => {
      const result = await recordFamilyPayment({
        familyId,
        termId,
        allocations: lines,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Build the slip from what was sent plus the balances we already hold:
      // the payload carries the family totals, the per-child lines come from
      // the ledger rows on screen.
      setReceipt({
        ...result.data,
        familyName,
        termLabel,
        sessionName,
        lines: lines.map((line) => {
          const child = payable.find((item) => item.studentId === line.studentId);
          return {
            studentId: line.studentId,
            studentName: child?.fullName ?? '—',
            admissionNumber: child?.admissionNumber ?? '—',
            className: child?.className ?? '—',
            amountPaid: line.amount,
            balanceAfter: roundKobo((child?.balance ?? 0) - line.amount),
          };
        }),
      });
      toast(`Receipt ${result.data.receiptNumber} issued`, 'success');
    });
  }

  if (receipt) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={`Receipt ${receipt.receiptNumber}`}
        description={`${familyName} · ${formatNaira(receipt.totalAmount)} received`}
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={close}>
              Done
            </Button>
          </div>
        }
      >
        <FamilyReceipt data={receipt} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record family payment"
      description={`${familyName} · ${payable.length} pupil(s) owing`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Family outstanding after</p>
            <p className="text-base font-semibold text-slate-900">
              {formatNaira(Math.max(familyAfter, 0))}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={pending}
              disabled={allocated <= 0 || problems.length > 0}
            >
              Record &amp; issue receipt
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {payable.length === 0 ? (
          <Alert tone="success">
            Every child in this family is fully paid up for {termLabel.replace('_', ' ')}.
          </Alert>
        ) : (
          <>
            <TextInput
              label="Total amount received"
              inputMode="decimal"
              autoFocus
              value={totalInput}
              onChange={(event) => onTotalChange(event.target.value)}
              placeholder="0.00"
              hint={`The family owes ${formatNaira(familyDue)} in total`}
            />

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">How the payment is split between the children.</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Pupil</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-700">Owing</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-700">Paying</th>
                  </tr>
                </thead>
                <tbody>
                  {payable.map((child) => {
                    const value = allocation[child.studentId];
                    const invalid = problems.some((item) => item.studentId === child.studentId);
                    return (
                      <tr key={child.studentId} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2">
                          <span className="block text-slate-900">{child.fullName}</span>
                          <span className="block text-xs text-slate-500">{child.className}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {formatNaira(child.balance)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Amount for ${child.fullName}`}
                            value={value === undefined ? '' : String(value)}
                            onChange={(event) => onLineChange(child.studentId, event.target.value)}
                            placeholder="0"
                            className={
                              invalid
                                ? 'w-28 rounded-md border border-red-400 px-2 py-1 text-right tabular-nums focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200'
                                : 'w-28 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-slate-600">
                Allocated <strong className="text-slate-900">{formatNaira(allocated)}</strong>
                {totalInput.trim() !== '' && remainingToAllocate !== 0 && (
                  <span className={remainingToAllocate > 0 ? 'text-amber-700' : 'text-red-600'}>
                    {' '}
                    · {remainingToAllocate > 0 ? 'unallocated' : 'over the total by'}{' '}
                    {formatNaira(Math.abs(remainingToAllocate))}
                  </span>
                )}
              </p>
              {touched && (
                <Button variant="outline" size="sm" onClick={redistribute}>
                  Re-split evenly from the total
                </Button>
              )}
            </div>

            {problems.length > 0 && <Alert>{problems[0]?.message}</Alert>}

            {allocated > 0 && problems.length === 0 && (
              <Alert tone={familyAfter <= 0 ? 'success' : 'info'}>
                Paying <strong>{formatNaira(allocated)}</strong> of{' '}
                <strong>{formatNaira(familyDue)}</strong> leaves the family owing{' '}
                <strong>{formatNaira(Math.max(familyAfter, 0))}</strong>
                {familyAfter <= 0 ? ' — every child is cleared.' : '.'}
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="Payment method"
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                options={PAYMENT_METHOD_OPTIONS}
              />
              <TextInput
                label="Reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Teller or transfer reference"
              />
            </div>

            <TextArea
              label="Notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional note kept on every slip in this payment"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
