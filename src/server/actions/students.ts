'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { BulkImportSummary } from '@/lib/roster/grouping';
import { importRowSchema } from '@/lib/roster/import';
import { createClient } from '@/lib/supabase/server';
import { errorMessage } from '@/lib/utils';
import { failure, fieldErrorsOf, fromPostgrestError, ok, type ActionResult } from './result';

const createStudentSchema = z.object({
  admissionNumber: z.string().trim().min(1, 'Admission number is required').max(50),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  middleName: z.string().trim().max(80).optional(),
  gender: z.enum(['male', 'female']).optional(),
  dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker').optional(),
  classId: z.string().uuid('Select a class'),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  guardianEmail: z.union([z.string().trim().email('Invalid email'), z.literal('')]).optional(),
});

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Register a single student and open their ledger for the given term. */
export async function createStudent(formData: FormData): Promise<ActionResult<{ studentId: string }>> {
  const parsed = createStudentSchema.safeParse({
    admissionNumber: text(formData, 'admissionNumber'),
    firstName: text(formData, 'firstName'),
    lastName: text(formData, 'lastName'),
    middleName: text(formData, 'middleName'),
    gender: text(formData, 'gender'),
    dateOfBirth: text(formData, 'dateOfBirth'),
    classId: text(formData, 'classId'),
    guardianName: text(formData, 'guardianName'),
    guardianPhone: text(formData, 'guardianPhone'),
    guardianEmail: text(formData, 'guardianEmail'),
  });

  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  const termId = text(formData, 'termId');
  const input = parsed.data;

  try {
    const supabase = await createClient();
    const { data: student, error } = await supabase
      .from('students')
      .insert({
        admission_number: input.admissionNumber,
        first_name: input.firstName,
        last_name: input.lastName,
        middle_name: input.middleName ?? null,
        gender: input.gender ?? null,
        date_of_birth: input.dateOfBirth ?? null,
        class_id: input.classId,
        guardian_name: input.guardianName ?? null,
        guardian_phone: input.guardianPhone ?? null,
        guardian_email: input.guardianEmail || null,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return failure('That admission number is already in use', {
          admissionNumber: 'Already taken',
        });
      }
      return failure(fromPostgrestError(error));
    }

    // Open this term's ledger line so the student appears on the fees sheet
    // immediately. Missing fee structure is not an error — it just means the
    // bursar has not published this term's fees yet.
    if (termId) {
      const { data: structure } = await supabase
        .from('fee_structures')
        .select('amount')
        .eq('class_id', input.classId)
        .eq('term_id', termId)
        .maybeSingle();

      if (structure) {
        await supabase.from('fee_accounts').insert({
          student_id: student.id,
          term_id: termId,
          class_id: input.classId,
          arrears: 0,
          current_bill: structure.amount,
        });
      }
    }

    revalidatePath('/students');
    revalidatePath('/fees');
    revalidatePath('/stationery');
    return ok({ studentId: student.id });
  } catch (error) {
    return failure(errorMessage(error, 'Could not register the student'));
  }
}

const bulkImportGroupsSchema = z.object({
  termId: z.string().uuid(),
  groups: z
    .array(
      z.object({
        classId: z.string().uuid(),
        className: z.string().trim().min(1),
        rows: z.array(importRowSchema).min(1),
      }),
    )
    .min(1, 'There are no valid rows to import'),
});

/**
 * Import a roster that spans several classes in one go.
 *
 * Each class is its own transaction, so one bad batch cannot roll back the
 * others. A failure is collected rather than thrown: with a few hundred rows in
 * flight, reporting "312 in, Primary 4 failed because X" is far more useful than
 * abandoning the whole upload. Re-running is safe — existing admission numbers
 * are skipped, not duplicated.
 */
export async function bulkImportStudentsByClass(
  input: z.infer<typeof bulkImportGroupsSchema>,
): Promise<ActionResult<BulkImportSummary>> {
  const parsed = bulkImportGroupsSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? 'Invalid import payload');
  }

  const summary: BulkImportSummary = { imported: 0, skipped: 0, perClass: [], failed: [] };

  try {
    const supabase = await createClient();

    for (const group of parsed.data.groups) {
      const { data, error } = await supabase.rpc('bulk_import_students', {
        p_class_id: group.classId,
        p_term_id: parsed.data.termId,
        p_rows: group.rows,
      });

      if (error) {
        summary.failed.push({ className: group.className, message: fromPostgrestError(error) });
        continue;
      }

      const counts = data?.[0] ?? { imported: 0, skipped: 0 };
      summary.imported += counts.imported;
      summary.skipped += counts.skipped;
      summary.perClass.push({
        className: group.className,
        imported: counts.imported,
        skipped: counts.skipped,
      });
    }

    // Every batch failed: there is nothing to celebrate, so report it as an error.
    if (summary.perClass.length === 0 && summary.failed.length > 0) {
      return failure(summary.failed[0]?.message ?? 'Could not import the roster');
    }

    revalidatePath('/students');
    revalidatePath('/fees');
    revalidatePath('/stationery');
    return ok(summary);
  } catch (error) {
    return failure(errorMessage(error, 'Could not import the roster'));
  }
}

const updateStudentSchema = createStudentSchema.partial().extend({
  studentId: z.string().uuid(),
});

export async function updateStudent(formData: FormData): Promise<ActionResult> {
  const parsed = updateStudentSchema.safeParse({
    studentId: text(formData, 'studentId'),
    firstName: text(formData, 'firstName'),
    lastName: text(formData, 'lastName'),
    middleName: text(formData, 'middleName'),
    gender: text(formData, 'gender'),
    dateOfBirth: text(formData, 'dateOfBirth'),
    classId: text(formData, 'classId'),
    guardianName: text(formData, 'guardianName'),
    guardianPhone: text(formData, 'guardianPhone'),
    guardianEmail: text(formData, 'guardianEmail'),
  });

  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  const { studentId, ...fields } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('students')
      .update({
        first_name: fields.firstName,
        last_name: fields.lastName,
        middle_name: fields.middleName ?? null,
        gender: fields.gender ?? null,
        date_of_birth: fields.dateOfBirth ?? null,
        class_id: fields.classId,
        guardian_name: fields.guardianName ?? null,
        guardian_phone: fields.guardianPhone ?? null,
        guardian_email: fields.guardianEmail || null,
      })
      .eq('id', studentId);

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/students');
    revalidatePath(`/students/${studentId}`);
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not update the student'));
  }
}

/** Soft delete. The ledger and receipts stay intact for audit. */
export async function archiveStudent(studentId: string, reason?: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('archive_student', {
      p_student_id: studentId,
      p_reason: reason ?? null,
    });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/students');
    revalidatePath('/fees');
    revalidatePath('/stationery');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not archive the student'));
  }
}

export async function restoreStudent(studentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('restore_student', { p_student_id: studentId });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/students');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not restore the student'));
  }
}
