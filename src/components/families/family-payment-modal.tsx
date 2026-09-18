'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { FamilyReceipt } from '@/components/fees/family-receipt';
import { Button } from '@/components/ui/button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
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
  outstanding: number;
  termId: string;
  termLabel: TermLabel;
  sessionName: string;
}

/**
 * Take one payment for a whole household.
 *
 * Two figures, both the bursar's: what was handed over, and what is still owed
 * afterwards. The second is suggested by subtraction and then left alone —
 * there are charges outside the school fee, so a parent can pay more than the
 * bill and still owe, and only the person at the desk knows which.
 */
export function FamilyPaymentModal({
  open,
  onClose,
  familyId,
  familyName,
  pupils,
  outstanding,
  termId,
  termLabel,
  sessionName,
}: FamilyPaymentModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [amountInput, setAmountInput] = useState('');
  const [outstandingInput, setOutstandingInput] = useState('');
  // Once the outstanding box is typed in, subtraction stops overwriting it.
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FamilyReceiptData | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setOutstandingInput(String(outstanding));
  }, [open, outstanding]);

  const amount = toKobo(toAmount(amountInput));
  const nextOutstanding = toKobo(toAmount(outstandingInput));
  const clears = nextOutstanding <= 0;
  const overpaying = amount > outstanding;

  function onAmountChange(value: string) {
    setAmountInput(value);
    setError(null);
    if (touched) return;
    setOutstandingInput(String(Math.max(toKobo(outstanding - toKobo(toAmount(value))), 0)));
  }

  function onOutstandingChange(value: string) {
    setTouched(true);
    setError(null);
    setOutstandingInput(value);
  }

  function resubtract() {
    setTouched(false);
    setOutstandingInput(String(Math.max(toKobo(outstanding - amount), 0)));
  }

  function reset() {
    setAmountInput('');
    setOutstandingInput(String(outstanding));
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

    if (amount <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    if (nextOutstanding < 0) {
      setError('Outstanding cannot be negative');
      return;
    }

    startTransition(async () => {
      const result = await recordFamilyPayment({
        familyId,
        termId,
        amount,
        outstandingAfter: nextOutstanding,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setReceipt({
        ...result.data,
        familyName,
        termLabel,
        sessionName,
        lines: pupils.map((child) => ({
          studentId: child.studentId,
          studentName: child.fullName,
          admissionNumber: child.admissionNumber,
          className: child.className,
        })),
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
      description={`${familyName} · ${pupils.length} pupil(s)`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding after</p>
            <p
              className={
                clears
                  ? 'text-base font-semibold text-brand-700'
                  : 'text-base font-semibold text-slate-900'
              }
            >
              {formatNaira(Math.max(nextOutstanding, 0))}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={amount <= 0}>
              Record &amp; issue receipt
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-center">
          <Figure label="Currently owing" value={formatNaira(outstanding)} emphasis />
          <Figure label="Children" value={String(pupils.length)} />
        </dl>

        <TextInput
          label="Amount received"
          inputMode="decimal"
          autoFocus
          value={amountInput}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder="0.00"
          hint="Record what the parent actually handed over"
        />

        <div>
          <TextInput
            label="Outstanding after this payment"
            inputMode="decimal"
            value={outstandingInput}
            onChange={(event) => onOutstandingChange(event.target.value)}
            placeholder="0.00"
            hint="Suggested by subtraction — change it if other charges are still owed"
          />
          {touched && (
            <div className="mt-1.5 flex justify-end">
              <Button variant="outline" size="sm" onClick={resubtract}>
                Reset to {formatNaira(Math.max(toKobo(outstanding - amount), 0))}
              </Button>
            </div>
          )}
        </div>

        {amount > 0 && (
          <Alert tone={clears ? 'success' : 'info'}>
            Paying <strong>{formatNaira(amount)}</strong>
            {overpaying && ' — more than the recorded fee'} leaves the family owing{' '}
            <strong>{formatNaira(Math.max(nextOutstanding, 0))}</strong>
            {clears ? ' — fully cleared.' : '.'}
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
          placeholder="Optional — what the extra charges were, for instance"
        />
      </div>
    </Modal>
  );
}

function Figure({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="bg-white px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={emphasis ? 'mt-0.5 text-sm font-bold text-slate-900' : 'mt-0.5 text-sm text-slate-700'}>
        {value}
      </dd>
    </div>
  );
}
