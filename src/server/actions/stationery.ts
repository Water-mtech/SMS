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
  sectionId: z.string().uuid('Select a section'),
  name: z.string().trim().min(1, 'Item name is required').max(120),
  description: z.string().trim().max(300).optional(),
  unitPrice: z.coerce.number().min(0, 'Price cannot be negative').max(10_000_000).default(0),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
});

/** Every screen that reads the catalogue, refreshed after a catalogue write. */
function revalidateCatalogue() {
  revalidatePath('/stationery');
  revalidatePath('/stationery/items');
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Add an item to a section's catalogue. */
export async function createStationeryItem(formData: FormData): Promise<ActionResult> {
  const parsed = itemSchema.safeParse({
    sectionId: text(formData, 'sectionId'),
    name: text(formData, 'name'),
    description: text(formData, 'description'),
    unitPrice: text(formData, 'unitPrice') ?? 0,
    displayOrder: text(formData, 'displayOrder') ?? 0,
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

    if (error) {
      // stationery_items_section_name_key: one name per section.
      if (error.code === '23505') {
        return failure('That section already has an item with this name', {
          name: 'Already in this section',
        });
      }
      return failure(fromPostgrestError(error));
    }

    revalidateCatalogue();
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not create the stationery item'));
  }
}

const updateItemSchema = itemSchema.omit({ sectionId: true }).extend({
  itemId: z.string().uuid(),
});

/** Edit an existing item. Its section is fixed: moving it would orphan the
 *  issue records of students in the section it came from. */
export async function updateStationeryItem(formData: FormData): Promise<ActionResult> {
  const parsed = updateItemSchema.safeParse({
    itemId: text(formData, 'itemId'),
    name: text(formData, 'name'),
    description: text(formData, 'description'),
    unitPrice: text(formData, 'unitPrice') ?? 0,
    displayOrder: text(formData, 'displayOrder') ?? 0,
  });

  if (!parsed.success) {
    return failure('Please correct the highlighted fields', fieldErrorsOf(parsed.error));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('stationery_items')
      .update({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        unit_price: parsed.data.unitPrice,
        display_order: parsed.data.displayOrder,
      })
      .eq('id', parsed.data.itemId);

    if (error) {
      if (error.code === '23505') {
        return failure('That section already has an item with this name', {
          name: 'Already in this section',
        });
      }
      return failure(fromPostgrestError(error));
    }

    revalidateCatalogue();
    return ok();
  } catch (error) {
    return failure(errorMessage(error, 'Could not update the stationery item'));
  }
}

/**
 * Retire or restore an item.
 *
 * Items are never deleted: a retired item drops out of the matrix and the
 * student drawer, but the record of who was already issued it survives.
 */
export async function setStationeryItemActive(
  itemId: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('stationery_items')
      .update({ is_active: isActive })
      .eq('id', itemId);

    if (error) return failure(fromPostgrestError(error));

    revalidateCatalogue();
    return ok();
  } catch (error) {
    return failure(
      errorMessage(error, isActive ? 'Could not restore the item' : 'Could not retire the item'),
    );
  }
}
