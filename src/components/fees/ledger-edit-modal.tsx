'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatNaira, toAmount, toKobo } from '@/lib/format';
import type { LedgerRow } from '@/lib/types/database';
import { setStudentLedger } from '@/server/actions/fees';

interface LedgerEditModalProps {
  open: boolean;
  row: LedgerRow | null;
  termId: string;
  classId: string;
  onClose: () => void;
}

/** Enter outstanding arrears alongside the current term's bill for one student. */
export function LedgerEditModal({ open, row, termId, classId, onClose }: LedgerEditModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [arrears, setArrears] = useState('0');
  const [currentBill, setCurrentBill] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open && row) {
      setArrears(String(row.arrears));
      setCurrentBill(String(row.currentBill));
      setError(null);
    }
  }, [open, row]);

  const total = toKobo(toAmount(arrears) + toAmount(currentBill));
  const paid = row?.totalPaid ?? 0;
  const balance = toKobo(total - paid);

  function submit() {
    if (!row) return;
    setError(null);

    if (total < paid) {
      setError(`This student has already paid ${formatNaira(paid)}; the total cannot be lower.`);
      return;
    }

    const formData = new FormData();
    formData.set('studentId', row.studentId);
    formData.set('termId', termId);
    formData.set('classId', classId);
    formData.set('arrears', String(toAmount(arrears)));
    formData.set('currentBill', String(toAmount(currentBill)));

    startTransition(async () => {
      const result = await setStudentLedger(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast(`Ledger updated for ${row.fullName}`, 'success');
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust ledger"
      description={row ? `${row.fullName} · ${row.admissionNumber}` : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">New balance</p>
            <p className="text-base font-semibold text-slate-900">{formatNaira(balance)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Save ledger
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <TextInput
          label="Outstanding arrears"
          inputMode="decimal"
          value={arrears}
          onChange={(event) => setArrears(event.target.value)}
          hint="Everything carried over from previous terms"
        />
        <TextInput
          label="Current term bill"
          inputMode="decimal"
          value={currentBill}
          onChange={(event) => setCurrentBill(event.target.value)}
          hint="What this term itself costs"
        />

        <dl className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
          <Row label="Total billed" value={formatNaira(total)} />
          <Row label="Already paid" value={formatNaira(paid)} />
          <Row label="Balance" value={formatNaira(balance)} strong />
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
