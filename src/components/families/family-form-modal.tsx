'use client';

import { Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { createFamily, updateFamily } from '@/server/actions/families';

interface FamilyFormModalProps {
  /** Omit to create a new family; pass one to edit it in place. */
  family?: { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
}

/** Create or rename a household and its guardian contact details. */
export function FamilyFormModal({ family }: FamilyFormModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const editing = Boolean(family);

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
  }

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      if (family) formData.set('familyId', family.id);
      const result = family ? await updateFamily(formData) : await createFamily(formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast(editing ? 'Family updated' : 'Family created', 'success');
      close();
      if (!editing && 'data' in result && result.data) {
        router.push(`/families/${(result.data as { id: string }).id}`);
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={editing ? 'outline' : 'primary'} size={editing ? 'sm' : undefined} onClick={() => setOpen(true)}>
        {editing ? (
          <>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit details
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New family
          </>
        )}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={editing ? 'Edit family' : 'New family'}
        description="The guardian the school deals with. Children are added to the family afterwards."
      >
        <form action={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <TextInput
            label="Guardian or family name"
            name="name"
            required
            autoFocus
            defaultValue={family?.name ?? ''}
            placeholder="Alhaji Musa Ibrahim"
            error={fieldErrors.name}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Phone"
              name="phone"
              inputMode="tel"
              defaultValue={family?.phone ?? ''}
              placeholder="08031234567"
              error={fieldErrors.phone}
              hint="Used to reach the parent about fees"
            />
            <TextInput
              label="Email"
              name="email"
              type="email"
              defaultValue={family?.email ?? ''}
              error={fieldErrors.email}
            />
          </div>

          <TextArea
            label="Notes"
            name="notes"
            defaultValue={family?.notes ?? ''}
            placeholder="Optional — anything the bursar should know"
            error={fieldErrors.notes}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Save changes' : 'Create family'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
