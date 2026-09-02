'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Receipt } from '@/components/fees/receipt';
import { Button } from '@/components/ui/button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PAYMENT_METHOD_OPTIONS, formatNaira, toAmount, toKobo } from '@/lib/format';
import type { LedgerRow, PaymentMethod, ReceiptData } from '@/lib/types/database';
import { recordPayment } from '@/server/actions/fees';

interface PaymentModalProps {
  open: boolean;
  row: LedgerRow | null;
  termId: string;
  onClose: () => void;
}

/**
 * Payment entry with live arithmetic: as the bursar types an amount, the
 * remaining balance updates on the spot, so ₦20,000 against a ₦200,000 bill
 * reads "₦180,000 remaining" before anything is submitted.
 */
export function PaymentModal({ open, row, termId, onClose }: PaymentModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [pending, startTransition] = useTransition();

  const totalDue = row?.balance ?? 0;

  const calculation = useMemo(() => {
    const amount = toKobo(toAmount(amountInput));
    const remaining = toKobo(totalDue - amount);
    return {
      amount,
      remaining,
      overpaying: amount > totalDue,
      clears: amount > 0 && remaining <= 0,
    };
  }, [amountInput, totalDue]);

  function reset() {
    setAmountInput('');
    setMethod('cash');
    setReference('');
    setNotes('');
    setError(null);
    setReceipt(null);
  }

  function close() {
    // Refresh once the receipt has been dealt with so the ledger reflects the payment.
    if (receipt) router.refresh();
    reset();
    onClose();
  }

  function submit() {
    if (!row) return;
    setError(null);

    if (calculation.amount <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    if (calculation.overpaying) {
      setError(`That is more than the ${formatNaira(totalDue)} outstanding on this account`);
      return;
    }

    startTransition(async () => {
      const result = await recordPayment({
        studentId: row.studentId,
        termId,
        amount: calculation.amount,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setReceipt(result.data);
      toast(`Receipt ${result.data.receiptNumber} issued`, 'success');
    });
  }

  if (receipt) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={`Receipt ${receipt.receiptNumber}`}
        description={`${receipt.studentName} · ${formatNaira(receipt.amountPaid)} received`}
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={close}>
              Done
            </Button>
          </div>
        }
      >
        <Receipt data={receipt} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record payment"
      description={row ? `${row.fullName} · ${row.admissionNumber}` : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Remaining after payment</p>
            <p
              className={
                calculation.overpaying
                  ? 'text-base font-semibold text-red-600'
                  : 'text-base font-semibold text-slate-900'
              }
            >
              {formatNaira(Math.max(calculation.remaining, 0))}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={calculation.amount <= 0}>
              Record &amp; issue receipt
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-center">
          <Figure label="Arrears" value={formatNaira(row?.arrears ?? 0)} />
          <Figure label="This term" value={formatNaira(row?.currentBill ?? 0)} />
          <Figure label="Outstanding" value={formatNaira(totalDue)} emphasis />
        </dl>

        <TextInput
          label="Amount being paid"
          inputMode="decimal"
          autoFocus
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder="0.00"
          hint={`Maximum ${formatNaira(totalDue)}`}
          error={calculation.overpaying ? 'Exceeds the outstanding balance' : undefined}
        />

        {calculation.amount > 0 && !calculation.overpaying && (
          <Alert tone={calculation.clears ? 'success' : 'info'}>
            Paying <strong>{formatNaira(calculation.amount)}</strong> of{' '}
            <strong>{formatNaira(totalDue)}</strong> leaves a balance of{' '}
            <strong>{formatNaira(calculation.remaining)}</strong>
            {calculation.clears ? ' — this clears the account.' : '.'}
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
          placeholder="Optional note kept on the payment record"
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
