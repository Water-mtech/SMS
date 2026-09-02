'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { toKobo } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { ReceiptData } from '@/lib/types/database';
import { errorMessage } from '@/lib/utils';
import { failure, fieldErrorsOf, fromPostgrestError, ok, type ActionResult } from './result';

const paymentSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  amount: z.coerce
    .number({ invalid_type_error: 'Enter a valid amount' })
    .positive('Amount must be greater than zero')
    .max(100_000_000, 'Amount looks too large'),
  method: z.enum(['cash', 'bank_transfer', 'pos', 'cheque', 'online']).default('cash'),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
});

export type RecordPaymentInput = z.input<typeof paymentSchema>;

/**
 * Record a payment and return everything the receipt needs.
 *
 * The ledger write, the receipt number, and the balance snapshot all happen
 * inside `record_fee_payment`, so a failed request can never leave a payment
 * without a receipt (or a receipt without a payment).
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<ActionResult<ReceiptData>> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  const { studentId, termId, amount, method, reference, notes } = parsed.data;

  try {
    const supabase = await createClient();
    const { data: payment, error } = await supabase.rpc('record_fee_payment', {
      p_student_id: studentId,
      p_term_id: termId,
      p_amount: toKobo(amount),
      p_method: method,
      p_reference: reference ?? null,
      p_notes: notes ?? null,
    });

    if (error) return failure(fromPostgrestError(error), { amount: fromPostgrestError(error) });
    if (!payment) return failure('The payment could not be recorded');

    // One follow-up read to decorate the receipt with names the RPC does not return.
    const { data: student } = await supabase
      .from('students')
      .select('first_name, last_name, middle_name, admission_number, class:classes(name)')
      .eq('id', studentId)
      .single();

    const { data: term } = await supabase
      .from('terms')
      .select('label, session:academic_sessions(name)')
      .eq('id', termId)
      .single();

    const studentRow = student as unknown as {
      first_name: string;
      last_name: string;
      middle_name: string | null;
      admission_number: string;
      class: { name: string } | null;
    } | null;

    const termRow = term as unknown as {
      label: ReceiptData['termLabel'];
      session: { name: string } | null;
    } | null;

    revalidatePath('/fees');
    revalidatePath('/');
    revalidatePath(`/students/${studentId}`);

    return ok({
      receiptNumber: payment.receipt_number,
      studentName: studentRow
        ? [studentRow.last_name, studentRow.first_name, studentRow.middle_name]
            .filter(Boolean)
            .join(' ')
        : 'Student',
      admissionNumber: studentRow?.admission_number ?? '—',
      className: studentRow?.class?.name ?? '—',
      termLabel: termRow?.label ?? 'first',
      sessionName: termRow?.session?.name ?? '—',
      amountPaid: payment.amount,
      balanceBefore: payment.balance_before,
      balanceAfter: payment.balance_after,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paid_at,
    });
  } catch (error) {
    return failure(errorMessage(error, 'Could not record the payment'));
  }
}

export async function voidPayment(paymentId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return failure('A reason is required to void a receipt');

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('void_fee_payment', {
      p_payment_id: paymentId,
      p_reason: reason.trim(),
    });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/fees');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not void the payment'));
  }
}

const feeStructureSchema = z.object({
  classId: z.string().uuid(),
  termId: z.string().uuid(),
  amount: z.coerce.number().min(0, 'Amount cannot be negative').max(100_000_000),
  description: z.string().trim().max(200).optional(),
});

/** Publish (or revise) a class's bill for a term, then apply it to the roster. */
export async function upsertFeeStructure(formData: FormData): Promise<ActionResult<{ applied: number }>> {
  const parsed = feeStructureSchema.safeParse({
    classId: formData.get('classId'),
    termId: formData.get('termId'),
    amount: formData.get('amount'),
    description: formData.get('description') || undefined,
  });

  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  const { classId, termId, amount, description } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('fee_structures')
      .upsert(
        { class_id: classId, term_id: termId, amount: toKobo(amount), description: description ?? null },
        { onConflict: 'class_id,term_id' },
      );

    if (error) return failure(fromPostgrestError(error));

    const { data: applied, error: syncError } = await supabase.rpc('sync_class_fee_bills', {
      p_class_id: classId,
      p_term_id: termId,
    });

    if (syncError) return failure(fromPostgrestError(syncError));

    revalidatePath('/fees');
    revalidatePath('/fees/structures');
    return ok({ applied: applied ?? 0 });
  } catch (error) {
    return failure(errorMessage(error, 'Could not save the fee structure'));
  }
}

const arrearsSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  arrears: z.coerce.number().min(0, 'Arrears cannot be negative'),
  currentBill: z.coerce.number().min(0, 'The bill cannot be negative'),
});

/**
 * Set a single student's two ledger legs directly — used when a bursar is
 * entering historic arrears alongside the current term's bill.
 */
export async function setStudentLedger(formData: FormData): Promise<ActionResult> {
  const parsed = arrearsSchema.safeParse({
    studentId: formData.get('studentId'),
    termId: formData.get('termId'),
    classId: formData.get('classId'),
    arrears: formData.get('arrears'),
    currentBill: formData.get('currentBill'),
  });

  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  const { studentId, termId, classId, arrears, currentBill } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('fee_accounts').upsert(
      {
        student_id: studentId,
        term_id: termId,
        class_id: classId,
        arrears: toKobo(arrears),
        current_bill: toKobo(currentBill),
      },
      { onConflict: 'student_id,term_id' },
    );

    if (error) {
      // The not-overpaid constraint fires when a bill is cut below what was paid.
      if (error.code === '23514') {
        return failure('That would put the account below what has already been paid');
      }
      return failure(fromPostgrestError(error));
    }

    revalidatePath('/fees');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not update the ledger'));
  }
}

/** Re-apply a published fee structure across a whole class. */
export async function syncClassBills(classId: string, termId: string): Promise<ActionResult<{ applied: number }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('sync_class_fee_bills', {
      p_class_id: classId,
      p_term_id: termId,
    });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/fees');
    return ok({ applied: data ?? 0 });
  } catch (error) {
    return failure(errorMessage(error, 'Could not apply the fee structure'));
  }
}
