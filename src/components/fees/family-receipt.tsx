'use client';

import { Printer, Share2, Check, Users } from 'lucide-react';
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
 * Thermal-style receipt for a payment covering several children.
 *
 * Printing is driven by the same `#printable-receipt` rules in globals.css as
 * the single-student slip, so one 80mm roll and one "Save as PDF" path serve
 * both. Which block carries that id is switched by `mode`: the family summary
 * the parent takes home, or one slip per child when they ask for them
 * separately — a child changing school mid-term often needs their own.
 */
export function FamilyReceipt({ data }: { data: FamilyReceiptData }) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'family' | 'children'>('family');

  const paidLines = data.lines.filter((line) => line.amountPaid > 0);
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
      {/* Family slip ------------------------------------------------------ */}
      <div
        id={mode === 'family' ? 'printable-receipt' : undefined}
        className={
          mode === 'family'
            ? 'mx-auto max-w-[22rem] rounded-lg border border-dashed border-slate-300 bg-white p-5 font-mono text-[13px] leading-relaxed text-slate-900'
            : 'hidden'
        }
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

        <table className="mt-3 w-full border-y border-dashed border-slate-300 py-1 text-[12px]">
          <caption className="sr-only">Amount paid for each child.</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="py-1 font-semibold">Pupil</th>
              <th scope="col" className="py-1 text-right font-semibold">Paid</th>
            </tr>
          </thead>
          <tbody>
            {paidLines.map((line) => (
              <tr key={line.studentId}>
                <td className="py-0.5 pr-2 align-top">
                  {line.studentName}
                  <span className="block text-[10px] text-slate-500">{line.className}</span>
                </td>
                <td className="py-0.5 text-right align-top tabular-nums">
                  {formatNaira(line.amountPaid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 space-y-1 text-[12px]">
          <Line label="Family total due" value={formatNaira(data.balanceBefore)} />
          <Line label="Total paid" value={formatNaira(data.totalAmount)} strong />
          <Line label="Family outstanding" value={formatNaira(data.balanceAfter)} strong />
        </dl>

        <p className="mt-3 border-t border-dashed border-slate-300 pt-2 text-center text-[11px]">
          {cleared ? 'All fees fully cleared. Thank you.' : 'Part payment received. Thank you.'}
        </p>
      </div>

      {/* One slip per child ----------------------------------------------- */}
      <div
        id={mode === 'children' ? 'printable-receipt' : undefined}
        className={mode === 'children' ? 'mx-auto max-w-[22rem] space-y-4' : 'hidden'}
      >
        {paidLines.map((line) => (
          <div
            key={line.studentId}
            className="rounded-lg border border-dashed border-slate-300 bg-white p-5 font-mono text-[13px] leading-relaxed text-slate-900"
          >
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wide">{school.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-600">{school.address}</p>
              <p className="mt-2 border-y border-dashed border-slate-300 py-1 text-[11px] font-semibold uppercase tracking-widest">
                Payment Receipt
              </p>
            </div>
            <dl className="mt-3 space-y-1 text-[12px]">
              <Line label="Receipt No" value={data.receiptNumber} strong />
              <Line label="Date" value={formatDateTime(data.paidAt)} />
              <Line label="Student" value={line.studentName} />
              <Line label="Adm. No" value={line.admissionNumber} />
              <Line label="Class" value={line.className} />
              <Line label="Term" value={`${formatTerm(data.termLabel)} · ${data.sessionName}`} />
            </dl>
            <dl className="mt-3 space-y-1 border-t border-dashed border-slate-300 pt-2 text-[12px]">
              <Line label="Amount paid" value={formatNaira(line.amountPaid)} strong />
              <Line label="Outstanding" value={formatNaira(line.balanceAfter)} strong />
            </dl>
            <p className="mt-3 text-center text-[10px] text-slate-500">
              Part of family receipt {data.receiptNumber} · {data.familyName}
            </p>
          </div>
        ))}
      </div>

      {/* Controls: never printed ------------------------------------------ */}
      <div className="print:hidden">
        <div className="mb-2 flex justify-center">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('family')}
              aria-pressed={mode === 'family'}
              className={
                mode === 'family'
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50'
              }
            >
              One family receipt
            </button>
            <button
              type="button"
              onClick={() => setMode('children')}
              aria-pressed={mode === 'children'}
              className={
                mode === 'children'
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50'
              }
            >
              <Users className="mr-1 inline h-3 w-3" aria-hidden="true" />
              A slip per child
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={print} className="flex-1">
            <Printer className="h-4 w-4" aria-hidden="true" />
            {mode === 'family' ? 'Print / Save PDF' : `Print ${paidLines.length} slips`}
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
