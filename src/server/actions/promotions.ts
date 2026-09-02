'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { errorMessage } from '@/lib/utils';
import { failure, fromPostgrestError, ok, type ActionResult } from './result';

const promoteSchema = z.object({
  fromClassId: z.string().uuid('Select the class to promote'),
  fromTermId: z.string().uuid('Select the term being closed'),
  toTermId: z.string().uuid('Select the term to promote into'),
});

export interface PromotionSummary {
  promoted: number;
  graduated: number;
  rolledOver: number;
}

/**
 * Promote a whole class one step along `promotion_order`, carrying every
 * uncleared balance into the destination term as arrears. Terminal classes
 * graduate instead of moving.
 */
export async function promoteClass(
  input: z.infer<typeof promoteSchema>,
): Promise<ActionResult<PromotionSummary>> {
  const parsed = promoteSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? 'Invalid promotion request');
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('promote_class', {
      p_from_class_id: parsed.data.fromClassId,
      p_from_term_id: parsed.data.fromTermId,
      p_to_term_id: parsed.data.toTermId,
    });

    if (error) {
      if (error.code === '23505') {
        return failure('This class has already been promoted between those two terms');
      }
      return failure(fromPostgrestError(error));
    }
    if (!data) return failure('The promotion did not complete');

    revalidatePath('/promotions');
    revalidatePath('/students');
    revalidatePath('/fees');
    revalidatePath('/stationery');

    return ok({
      promoted: data.student_count,
      graduated: data.graduated_count,
      rolledOver: data.rolled_over_total,
    });
  } catch (error) {
    return failure(errorMessage(error, 'Could not promote the class'));
  }
}

/** Count of students who would move, and what they still owe. */
export async function previewPromotion(
  classId: string,
  termId: string,
): Promise<ActionResult<{ students: number; outstanding: number }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('fee_accounts')
      .select('balance, student:students!inner(id, class_id, status, archived_at)')
      .eq('term_id', termId)
      .eq('student.class_id', classId)
      .eq('student.status', 'active')
      .is('student.archived_at', null);

    if (error) return failure(fromPostgrestError(error));

    const rows = data ?? [];
    return ok({
      students: rows.length,
      outstanding: rows.reduce((sum, row) => sum + Math.max(Number(row.balance) || 0, 0), 0),
    });
  } catch (error) {
    return failure(errorMessage(error, 'Could not preview the promotion'));
  }
}
