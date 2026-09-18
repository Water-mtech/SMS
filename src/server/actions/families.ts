'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { FamilyReceiptPayload } from '@/lib/fees/family-receipt';
import { createClient } from '@/lib/supabase/server';
import { searchStudentsForFamily, type UnassignedStudent } from '@/server/queries';
import { errorMessage } from '@/lib/utils';
import { failure, fieldErrorsOf, fromPostgrestError, ok, type ActionResult } from './result';

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const familySchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email('Invalid email').max(160).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createFamily(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = familySchema.safeParse({
    name: text(formData, 'name'),
    phone: text(formData, 'phone'),
    email: text(formData, 'email'),
    notes: text(formData, 'notes'),
  });
  if (!parsed.success) {
    return failure('Check the family details', fieldErrorsOf(parsed.error));
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('families')
      .insert({
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        notes: parsed.data.notes ?? null,
      })
      .select('id')
      .single();

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/families');
    return ok({ id: data.id });
  } catch (error) {
    return failure(errorMessage(error, 'Could not create the family'));
  }
}

const updateFamilySchema = familySchema.extend({ familyId: z.string().uuid() });

export async function updateFamily(formData: FormData): Promise<ActionResult> {
  const parsed = updateFamilySchema.safeParse({
    familyId: text(formData, 'familyId'),
    name: text(formData, 'name'),
    phone: text(formData, 'phone'),
    email: text(formData, 'email'),
    notes: text(formData, 'notes'),
  });
  if (!parsed.success) {
    return failure('Check the family details', fieldErrorsOf(parsed.error));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('families')
      .update({
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        notes: parsed.data.notes ?? null,
      })
      .eq('id', parsed.data.familyId);

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/families');
    revalidatePath(`/families/${parsed.data.familyId}`);
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not update the family'));
  }
}

const membershipSchema = z.object({
  familyId: z.string().uuid().nullable(),
  studentIds: z.array(z.string().uuid()).min(1, 'Select at least one pupil'),
});

/**
 * Add pupils to a household, or with a null family, take them out of one.
 *
 * Goes through the RPC rather than updating students directly: assigning a
 * family is the one change to a pupil a bursar is allowed to make, and the
 * function is what draws that line.
 */
export async function setStudentFamily(
  input: z.infer<typeof membershipSchema>,
): Promise<ActionResult<{ moved: number }>> {
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('set_student_family', {
      p_family_id: parsed.data.familyId,
      p_student_ids: parsed.data.studentIds,
    });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/families');
    if (parsed.data.familyId) revalidatePath(`/families/${parsed.data.familyId}`);
    revalidatePath('/students');
    return ok({ moved: data ?? 0 });
  } catch (error) {
    return failure(errorMessage(error, 'Could not update the family'));
  }
}

/**
 * Deleting a household never touches the children: the foreign key is ON DELETE
 * SET NULL, so they simply become unassigned and keep every payment they have
 * ever made.
 */
export async function deleteFamily(familyId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(familyId).success) return failure('Invalid family');

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('families').delete().eq('id', familyId);
    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/families');
    revalidatePath('/students');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not delete the family'));
  }
}

const familyPaymentSchema = z.object({
  familyId: z.string().uuid(),
  termId: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        amount: z.number().positive(),
      }),
    )
    .min(1, 'Enter an amount for at least one pupil'),
  method: z.enum(['cash', 'bank_transfer', 'pos', 'cheque', 'online']).default('cash'),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
});

/**
 * Record one handover covering several children. The RPC validates every line
 * against that child's own balance and writes the whole set in one transaction,
 * so a mistyped amount cannot leave half a payment behind.
 */
export async function recordFamilyPayment(
  input: z.infer<typeof familyPaymentSchema>,
): Promise<ActionResult<FamilyReceiptPayload>> {
  const parsed = familyPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? 'Invalid payment');
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('record_family_payment', {
      p_family_id: parsed.data.familyId,
      p_term_id: parsed.data.termId,
      p_allocations: parsed.data.allocations.map((line) => ({
        student_id: line.studentId,
        amount: line.amount,
      })),
      p_method: parsed.data.method,
      p_reference: parsed.data.reference ?? null,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) return failure(fromPostgrestError(error));
    if (!data) return failure('The payment did not go through');

    revalidatePath('/families');
    revalidatePath(`/families/${parsed.data.familyId}`);
    revalidatePath('/fees');
    revalidatePath('/students');

    return ok({
      familyPaymentId: data.id,
      receiptNumber: data.receipt_number,
      totalAmount: Number(data.total_amount),
      balanceBefore: Number(data.balance_before),
      balanceAfter: Number(data.balance_after),
      paidAt: data.paid_at,
      method: data.method,
    });
  } catch (error) {
    return failure(errorMessage(error, 'Could not record the payment'));
  }
}

/**
 * Roster search for the "add children" picker.
 *
 * A thin action over the query so the modal can search on demand without the
 * page shipping the whole roster to the browser.
 */
export async function searchStudentsForFamilyAction(
  search: string,
): Promise<ActionResult<UnassignedStudent[]>> {
  const term = search.trim();
  if (!term) return ok([]);

  try {
    return ok(await searchStudentsForFamily(term));
  } catch (error) {
    return failure(errorMessage(error, 'Could not search for pupils'));
  }
}
