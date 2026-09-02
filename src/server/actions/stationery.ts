'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { errorMessage } from '@/lib/utils';
import { failure, fieldErrorsOf, fromPostgrestError, ok, type ActionResult } from './result';

const setIssuesSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()),
});

/**
 * Replace the set of items a student has been issued this term.
 *
 * Both "Select All" and single-checkbox toggles call this with the full desired
 * set, so the drawer never has to reason about diffs — the database does it in
 * one transaction.
 */
export async function setStudentStationery(
  input: z.infer<typeof setIssuesSchema>,
): Promise<ActionResult<{ issuedItemIds: string[] }>> {
  const parsed = setIssuesSchema.safeParse(input);
  if (!parsed.success) return failure('Invalid stationery selection');

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('set_student_stationery', {
      p_student_id: parsed.data.studentId,
      p_term_id: parsed.data.termId,
      p_item_ids: parsed.data.itemIds,
    });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/stationery');
    return ok({ issuedItemIds: (data ?? []).map((issue) => issue.item_id) });
  } catch (error) {
    return failure(errorMessage(error, 'Could not save the stationery selection'));
  }
}

const itemSchema = z.object({
  sectionId: z.string().uuid(),
  name: z.string().trim().min(1, 'Item name is required').max(120),
  description: z.string().trim().max(300).optional(),
  unitPrice: z.coerce.number().min(0, 'Price cannot be negative').default(0),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export async function createStationeryItem(formData: FormData): Promise<ActionResult> {
  const parsed = itemSchema.safeParse({
    sectionId: formData.get('sectionId'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    unitPrice: formData.get('unitPrice') ?? 0,
    displayOrder: formData.get('displayOrder') ?? 0,
  });

  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('stationery_items').insert({
      section_id: parsed.data.sectionId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      unit_price: parsed.data.unitPrice,
      display_order: parsed.data.displayOrder,
    });

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/stationery');
    revalidatePath('/settings');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not create the stationery item'));
  }
}

export async function deactivateStationeryItem(itemId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('stationery_items')
      .update({ is_active: false })
      .eq('id', itemId);

    if (error) return failure(fromPostgrestError(error));

    revalidatePath('/stationery');
    revalidatePath('/settings');
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not retire the stationery item'));
  }
}
