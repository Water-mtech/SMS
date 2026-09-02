'use client';

import { Printer, Share2, Check } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { school } from '@/lib/env';
import { formatDateTime, formatNaira, formatPaymentMethod, formatTerm } from '@/lib/format';
import type { ReceiptData } from '@/lib/types/database';

/**
 * Thermal-style receipt.
 *
 * The printed output is driven entirely by the `#printable-receipt` rules in
 * globals.css: everything else on the page is hidden and this block is sized to
 * an 80mm roll, so "Print" works on both a receipt printer and "Save as PDF".
 */
export function Receipt({ data }: { data: ReceiptData }) {
  const [copied, setCopied] = useState(false);

  const cleared = data.balanceAfter <= 0;

  function print() {
    window.print();
  }

  function shareOnWhatsApp() {
    window.open(whatsappUrl(data), '_blank', 'noopener,noreferrer');
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(receiptText(data));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the receipt is still on screen to read.
    }
  }

  return (
    <div className="space-y-4">
      <div
        id="printable-receipt"
        className="mx-auto max-w-[22rem] rounded-lg border border-dashed border-slate-300 bg-white p-5 font-mono text-[13px] leading-relaxed text-slate-900"
      >
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide">{school.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">{school.address}</p>
          <p className="text-[11px] text-slate-600">{school.phone}</p>
          <p className="mt-2 border-y border-dashed border-slate-300 py-1 text-[11px] font-semibold uppercase tracking-widest">
            Payment Receipt
          </p>
        </div>

        <dl className="mt-3 space-y-1 text-[12px]">
          <Line label="Receipt No" value={data.receiptNumber} strong />
          <Line label="Date" value={formatDateTime(data.paidAt)} />
          <Line label="Student" value={data.studentName} />
          <Line label="Adm. No" value={data.admissionNumber} />
          <Line label="Class" value={data.className} />
          <Line label="Term" value={`${formatTerm(data.termLabel)} · ${data.sessionName}`} />
          <Line label="Method" value={formatPaymentMethod(data.method)} />
          {data.reference && <Line label="Reference" value={data.reference} />}
        </dl>

        <div className="my-3 border-t border-dashed border-slate-300" />

        <dl className="space-y-1 text-[12px]">
          <Line label="Total due" value={formatNaira(data.balanceBefore)} />
          <Line label="Amount paid" value={formatNaira(data.amountPaid)} strong />
          <Line label="Balance" value={formatNaira(data.balanceAfter)} strong />
        </dl>

        <div className="my-3 border-t border-dashed border-slate-300" />

        <p className="text-center text-[11px] font-semibold uppercase tracking-wide">
          {cleared ? 'Fees fully cleared — thank you' : 'Part payment received'}
        </p>
        <p className="mt-2 text-center text-[10px] text-slate-500">
          This receipt is computer generated and valid without a signature.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={print} className="flex-1">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print / Save PDF
        </Button>
        <Button variant="secondary" onClick={shareOnWhatsApp} className="flex-1">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share on WhatsApp
        </Button>
        <Button variant="outline" onClick={copySummary} aria-label="Copy receipt details">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={strong ? 'text-right font-bold' : 'text-right'}>{value}</dd>
    </div>
  );
}

/** Plain-text rendering of the receipt, for WhatsApp and the clipboard. */
export function receiptText(data: ReceiptData): string {
  return [
    `*${school.name}*`,
    'Payment Receipt',
    '',
    `Receipt No: ${data.receiptNumber}`,
    `Date: ${formatDateTime(data.paidAt)}`,
    `Student: ${data.studentName} (${data.admissionNumber})`,
    `Class: ${data.className}`,
    `Term: ${formatTerm(data.termLabel)} - ${data.sessionName}`,
    '',
    `Total due: ${formatNaira(data.balanceBefore)}`,
    `Amount paid: ${formatNaira(data.amountPaid)}`,
    `Outstanding balance: ${formatNaira(data.balanceAfter)}`,
    '',
    data.balanceAfter <= 0 ? 'Fees fully cleared. Thank you.' : 'Part payment received. Thank you.',
  ].join('\n');
}

export function whatsappUrl(data: ReceiptData): string {
  return `https://wa.me/?text=${encodeURIComponent(receiptText(data))}`;
}
