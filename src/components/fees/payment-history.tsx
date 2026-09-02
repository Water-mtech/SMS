'use client';

import { useState } from 'react';
import { Receipt as ReceiptIcon } from 'lucide-react';

import { Receipt } from '@/components/fees/receipt';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/overlay';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { formatDateTime, formatNaira, formatPaymentMethod } from '@/lib/format';
import type { ReceiptData } from '@/lib/types/database';

export interface PaymentHistoryRow extends ReceiptData {
  id: string;
  voided: boolean;
  voidedReason: string | null;
}

/** Past payments with one-click receipt reprinting. */
export function PaymentHistory({ payments }: { payments: PaymentHistoryRow[] }) {
  const [active, setActive] = useState<PaymentHistoryRow | null>(null);

  if (payments.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptIcon className="h-8 w-8" />}
        title="No payments recorded yet"
        description="Payments made against this student's ledger will appear here with their receipts."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Payment history with receipt numbers and balances.</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Receipt</th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Date</th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Method</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Balance after</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                  {payment.receiptNumber}
                  {payment.voided && (
                    <Badge tone="danger" className="ml-2">
                      Voided
                    </Badge>
                  )}
                </th>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(payment.paidAt)}</td>
                <td className="px-4 py-3 text-slate-600">{formatPaymentMethod(payment.method)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                  {formatNaira(payment.amountPaid)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatNaira(payment.balanceAfter)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActive(payment)}
                    aria-label={`View receipt ${payment.receiptNumber}`}
                  >
                    View receipt
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? `Receipt ${active.receiptNumber}` : 'Receipt'}
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setActive(null)}>
              Close
            </Button>
          </div>
        }
      >
        {active && <Receipt data={active} />}
      </Modal>
    </>
  );
}
