import { school } from '@/lib/env';
import { formatDateTime, formatNaira, formatPaymentMethod, formatTerm } from '@/lib/format';
import type { PaymentMethod, TermLabel } from '@/lib/types/database';

/** What `record_family_payment` hands back once the handover is written. */
export interface FamilyReceiptPayload {
  familyPaymentId: string;
  receiptNumber: string;
  totalAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  paidAt: string;
  method: PaymentMethod;
}

/** One child's share of a family handover, as it appears on the slip. */
export interface FamilyReceiptLine {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  amountPaid: number;
  /** That child's own balance once their share was applied. */
  balanceAfter: number;
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
  const lines = data.lines
    .filter((line) => line.amountPaid > 0)
    .map((line) => `${line.studentName} (${line.className}): ${formatNaira(line.amountPaid)}`);

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
    ...lines,
    '',
    `Family total due: ${formatNaira(data.balanceBefore)}`,
    `Total paid: ${formatNaira(data.totalAmount)}`,
    `Family outstanding: ${formatNaira(data.balanceAfter)}`,
    '',
    data.balanceAfter <= 0
      ? 'All fees fully cleared. Thank you.'
      : 'Part payment received. Thank you.',
  ].join('\n');
}

export function familyWhatsappUrl(data: FamilyReceiptData): string {
  return `https://wa.me/?text=${encodeURIComponent(familyReceiptText(data))}`;
}
