import type { PaymentMethod, TermLabel } from '@/lib/types/database';

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** ₦180,000.00 */
export function formatNaira(amount: number | string | null | undefined): string {
  return nairaFormatter.format(toAmount(amount));
}

/** ₦1.2M — for dashboard tiles where the exact kobo is noise. */
export function formatNairaCompact(amount: number | string | null | undefined): string {
  return compactFormatter.format(toAmount(amount));
}

/**
 * PostgREST hands `numeric` columns back as numbers, but form inputs and CSV
 * cells arrive as strings. Normalise both, and never return NaN.
 */
export function toAmount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Round to kobo so floating-point drift never reaches the ledger. */
export function toKobo(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const TERM_LABELS: Record<TermLabel, string> = {
  first: 'First Term',
  second: 'Second Term',
  third: 'Third Term',
};

export function formatTerm(label: TermLabel): string {
  return TERM_LABELS[label];
}

const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  pos: 'POS',
  cheque: 'Cheque',
  online: 'Online',
};

export function formatPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_METHODS[method];
}

export const PAYMENT_METHOD_OPTIONS = (Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map(
  (value) => ({ value, label: PAYMENT_METHODS[value] }),
);

/** Initials for roster avatars: "Adeyemi Grace" -> "AG". */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
