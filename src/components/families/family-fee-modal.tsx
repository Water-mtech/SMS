'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatNaira, toAmount, toKobo } from '@/lib/format';
import { setFamilyFee } from '@/server/actions/families';

interface FamilyFeeModalProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  familyName: string;
  termId: string;
  arrears: number;
  currentBill: number;
  totalPaid: number;
  outstanding: number;
  /** False when the household has no fee for this term yet. */
  hasFee: boolean;
}

/**
 * Set what a household owes for the term.
 *
 * No class structure sits behind this — a family spans classes, so its fee is
 * whatever the school agreed with that parent. Outstanding is offered as billed
 * less paid and can be overwritten, which is the whole point: charges the ledger
 * never saw are entered here rather than being invented as a bill.
 */
export function FamilyFeeModal({
  open,
  onClose,
  familyId,
  familyName,
  termId,
  arrears,
  currentBill,
  totalPaid,
  outstanding,
  hasFee,
}: FamilyFeeModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [arrearsInput, setArrearsInput] = useState('0');
  const [billInput, setBillInput] = useState('0');
  const [outstandingInput, setOutstandingInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setArrearsInput(String(arrears));
    setBillInput(String(currentBill));
    setOutstandingInput(String(outstanding));
    setTouched(false);
    setError(null);
  }, [open, arrears, currentBill, outstanding]);

  const billed = toKobo(toAmount(arrearsInput) + toAmount(billInput));
  const derived = Math.max(toKobo(billed - totalPaid), 0);
  const nextOutstanding = toKobo(toAmount(outstandingInput));

  /** Editing either billed figure re-suggests outstanding, until it is typed in. */
  function onBilledChange(field: 'arrears' | 'bill', value: string) {
    if (field === 'arrears') setArrearsInput(value);
    else setBillInput(value);
    setError(null);
    if (touched) return;

    const nextBilled =
      field === 'arrears'
        ? toKobo(toAmount(value) + toAmount(billInput))
        : toKobo(toAmount(arrearsInput) + toAmount(value));
    setOutstandingInput(String(Math.max(toKobo(nextBilled - totalPaid), 0)));
  }

  function submit() {
    setError(null);
    if (nextOutstanding < 0) {
      setError('Outstanding cannot be negative');
      return;
    }

    startTransition(async () => {
      const result = await setFamilyFee({
        familyId,
        termId,
        arrears: toAmount(arrearsInput),
        currentBill: toAmount(billInput),
        outstanding: toAmount(outstandingInput),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast(hasFee ? 'Family fee updated' : 'Family fee set', 'success');
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hasFee ? 'Edit family fee' : 'Set family fee'}
      description={`${familyName} — one fee for the whole household, across every class.`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p>
            <p className="text-base font-semibold text-slate-900">
              {formatNaira(Math.max(nextOutstanding, 0))}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Save fee
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <TextInput
          label="Brought forward"
          inputMode="decimal"
          value={arrearsInput}
          onChange={(event) => onBilledChange('arrears', event.target.value)}
          hint="Anything still owed from previous terms"
        />
        <TextInput
          label="This term's fee"
          inputMode="decimal"
          autoFocus
          value={billInput}
          onChange={(event) => onBilledChange('bill', event.target.value)}
          hint="What the school agreed with this family for the term"
        />

        <div>
          <TextInput
            label="Outstanding"
            inputMode="decimal"
            value={outstandingInput}
            onChange={(event) => {
              setTouched(true);
              setError(null);
              setOutstandingInput(event.target.value);
            }}
            hint="Add charges outside the school fee here rather than inflating the fee itself"
          />
          {touched && nextOutstanding !== derived && (
            <div className="mt-1.5 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTouched(false);
                  setOutstandingInput(String(derived));
                }}
              >
                Reset to {formatNaira(derived)}
              </Button>
            </div>
          )}
        </div>

        <dl className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
          <Row label="Total billed" value={formatNaira(billed)} />
          <Row label="Already paid" value={formatNaira(totalPaid)} />
          <Row label="Outstanding" value={formatNaira(Math.max(nextOutstanding, 0))} strong />
        </dl>
      </div>
    </Modal>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? 'font-semibold text-slate-900' : 'text-slate-700'}>{value}</dd>
    </div>
  );
}
