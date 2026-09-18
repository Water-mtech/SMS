import { school } from '@/lib/env';
import { formatDateTime, formatNaira, formatPaymentMethod, formatTerm } from '@/lib/format';
import type { PaymentMethod, TermLabel } from '@/lib/types/database';

/** What `record_family_payment` hands back once the payment is written. */
export interface FamilyReceiptPayload {
  familyPaymentId: string;
  receiptNumber: string;
  totalAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  paidAt: string;
  method: PaymentMethod;
}

/**
 * A child the payment covers.
 *
 * Named, never priced: the household is what the school bills, so there is no
 * honest per-child figure to print. Listing them still tells the parent which
 * children this receipt answers for.
 */
export interface FamilyReceiptLine {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
}

export interface FamilyReceiptData extends FamilyReceiptPayload {
  familyName: string;
  termLabel: TermLabel;
  sessionName: string;
  lines: FamilyReceiptLine[];
}

/**
 * Plain-text family receipt, for WhatsApp and the clipboard.
 *
 * Deliberately close to the single-student version in `receipt.tsx`: parents
 * receive both, and a message that reads differently each time invites the
 * question of whether it is genuine.
 */
export function familyReceiptText(data: FamilyReceiptData): string {
  const pupils = data.lines.map((line) => `  ${line.studentName} (${line.className})`);

  return [
    `*${school.name}*`,
    'Family Payment Receipt',
    '',
    `Receipt No: ${data.receiptNumber}`,
    `Date: ${formatDateTime(data.paidAt)}`,
    `Family: ${data.familyName}`,
    `Term: ${formatTerm(data.termLabel)} - ${data.sessionName}`,
    `Method: ${formatPaymentMethod(data.method)}`,
    '',
    ...(pupils.length > 0 ? ['Pupils covered:', ...pupils, ''] : []),
    `Amount paid: ${formatNaira(data.totalAmount)}`,
    `Outstanding: ${formatNaira(data.balanceAfter)}`,
    '',
    data.balanceAfter <= 0
      ? 'All fees fully cleared. Thank you.'
      : 'Part payment received. Thank you.',
  ].join('\n');
}

export function familyWhatsappUrl(data: FamilyReceiptData): string {
  return `https://wa.me/?text=${encodeURIComponent(familyReceiptText(data))}`;
}
