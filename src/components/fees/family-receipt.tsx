'use client';

import { Printer, Share2, Check } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { school } from '@/lib/env';
import {
  familyReceiptText,
  familyWhatsappUrl,
  type FamilyReceiptData,
} from '@/lib/fees/family-receipt';
import { formatDateTime, formatNaira, formatPaymentMethod, formatTerm } from '@/lib/format';

/**
 * Thermal-style receipt for a payment covering a whole household.
 *
 * The children are named but carry no figures: the family is what the school
 * bills, so the only honest money on this slip is what the parent handed over
 * and what they still owe. Printing rides the same `#printable-receipt` rules in
 * globals.css as the single-student slip, so one 80mm roll serves both.
 */
export function FamilyReceipt({ data }: { data: FamilyReceiptData }) {
  const [copied, setCopied] = useState(false);
  const cleared = data.balanceAfter <= 0;

  function print() {
    window.print();
  }

  function shareOnWhatsApp() {
    window.open(familyWhatsappUrl(data), '_blank', 'noopener,noreferrer');
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(familyReceiptText(data));
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
            Family Payment Receipt
          </p>
        </div>

        <dl className="mt-3 space-y-1 text-[12px]">
          <Line label="Receipt No" value={data.receiptNumber} strong />
          <Line label="Date" value={formatDateTime(data.paidAt)} />
          <Line label="Family" value={data.familyName} />
          <Line label="Term" value={`${formatTerm(data.termLabel)} · ${data.sessionName}`} />
          <Line label="Method" value={formatPaymentMethod(data.method)} />
        </dl>

        {data.lines.length > 0 && (
          <div className="mt-3 border-y border-dashed border-slate-300 py-2 text-[12px]">
            <p className="text-slate-500">Pupils covered</p>
            <ul className="mt-1 space-y-0.5">
              {data.lines.map((line) => (
                <li key={line.studentId} className="flex justify-between gap-3">
                  <span>{line.studentName}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{line.className}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="mt-3 space-y-1 text-[12px]">
          <Line label="Amount paid" value={formatNaira(data.totalAmount)} strong />
          <Line label="Outstanding" value={formatNaira(data.balanceAfter)} strong />
        </dl>

        <p className="mt-3 border-t border-dashed border-slate-300 pt-2 text-center text-[11px]">
          {cleared ? 'All fees fully cleared. Thank you.' : 'Part payment received. Thank you.'}
        </p>
      </div>

      <div className="flex gap-2 print:hidden">
        <Button onClick={print} className="flex-1">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print / Save PDF
        </Button>
        <Button variant="secondary" onClick={shareOnWhatsApp} className="flex-1">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share on WhatsApp
        </Button>
        <Button variant="outline" onClick={copySummary} aria-label="Copy receipt text">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={strong ? 'text-right font-bold' : 'text-right'}>{value}</dd>
    </div>
  );
}
