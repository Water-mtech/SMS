'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Archive, PackagePlus, Pencil, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert, Badge, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatNaira } from '@/lib/format';
import {
  createStationeryItem,
  setStationeryItemActive,
  updateStationeryItem,
} from '@/server/actions/stationery';

export interface CatalogueRow {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  displayOrder: number;
  isActive: boolean;
  issuedCount: number;
}

interface CatalogueManagerProps {
  items: CatalogueRow[];
  sectionId: string;
  sectionName: string;
  canManage: boolean;
}

/**
 * Manage one section's stationery catalogue.
 *
 * Items are retired rather than deleted: a retired item disappears from the
 * class matrix and the student drawer, but every record of who already received
 * it stays intact.
 */
export function CatalogueManager({
  items,
  sectionId,
  sectionName,
  canManage,
}: CatalogueManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CatalogueRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [retiring, setRetiring] = useState<CatalogueRow | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleActive(item: CatalogueRow, isActive: boolean) {
    startTransition(async () => {
      const result = await setStationeryItemActive(item.id, isActive);
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast(isActive ? `${item.name} restored` : `${item.name} retired`, 'success');
      setRetiring(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{sectionName} catalogue</h2>
          <p className="text-xs text-slate-500">
            {items.filter((item) => item.isActive).length} active item
            {items.filter((item) => item.isActive).length === 1 ? '' : 's'} · shown as columns on the
            class matrix
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add item
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<PackagePlus className="h-8 w-8" />}
          title={`No stationery items for ${sectionName} yet`}
          description={
            canManage
              ? 'Add the items this section issues each term. They become the columns of the class matrix.'
              : 'An administrator needs to add items to this section.'
          }
          action={
            canManage ? <Button onClick={() => setAdding(true)}>Add the first item</Button> : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Stationery items belonging to the {sectionName} section.
            </caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Item</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Price</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Order</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Issued</th>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="block font-medium text-slate-900">{item.name}</span>
                    {item.description && (
                      <span className="block text-xs text-slate-500">{item.description}</span>
                    )}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatNaira(item.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                    {item.displayOrder}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {item.issuedCount}
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Retired</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(item)}
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {item.isActive ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setRetiring(item)}
                            aria-label={`Retire ${item.name}`}
                          >
                            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => toggleActive(item, true)}
                            aria-label={`Restore ${item.name}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            Restore
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ItemFormModal
        open={adding}
        sectionId={sectionId}
        sectionName={sectionName}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          router.refresh();
        }}
      />

      <ItemFormModal
        open={editing !== null}
        item={editing ?? undefined}
        sectionId={sectionId}
        sectionName={sectionName}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <Modal
        open={retiring !== null}
        onClose={() => setRetiring(null)}
        title="Retire item"
        description={retiring ? retiring.name : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRetiring(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => retiring && toggleActive(retiring, false)}
            >
              Retire item
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {retiring?.name} will stop appearing on the class matrix and in the student drawer.
          {retiring && retiring.issuedCount > 0 ? (
            <>
              {' '}
              The {retiring.issuedCount} existing issue record
              {retiring.issuedCount === 1 ? '' : 's'} will be kept, and you can restore the item at
              any time.
            </>
          ) : (
            ' You can restore it at any time.'
          )}
        </p>
      </Modal>
    </>
  );
}

function ItemFormModal({
  open,
  item,
  sectionId,
  sectionName,
  onClose,
  onSaved,
}: {
  open: boolean;
  item?: CatalogueRow;
  sectionId: string;
  sectionName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const editing = Boolean(item);
  const formId = editing ? `edit-item-${item?.id}` : 'add-item';

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = editing
        ? await updateStationeryItem(formData)
        : await createStationeryItem(formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast(editing ? `${formData.get('name')} updated` : `${formData.get('name')} added`, 'success');
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit stationery item' : 'Add stationery item'}
      description={`${sectionName} section`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {editing ? 'Save changes' : 'Add item'}
          </Button>
        </div>
      }
    >
      {/* `key` re-seeds defaultValue when the modal is reopened for another item. */}
      <form id={formId} key={item?.id ?? 'new'} action={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {editing ? (
          <input type="hidden" name="itemId" value={item?.id} />
        ) : (
          <input type="hidden" name="sectionId" value={sectionId} />
        )}

        <TextInput
          label="Item name"
          name="name"
          required
          autoFocus
          defaultValue={item?.name}
          placeholder="2B Exercise Book"
          error={fieldErrors.name}
        />
        <TextArea
          label="Description"
          name="description"
          defaultValue={item?.description ?? ''}
          placeholder="80-leaf ruled exercise book"
          error={fieldErrors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Unit price"
            name="unitPrice"
            inputMode="decimal"
            defaultValue={item ? String(item.unitPrice) : '0'}
            hint="Used for the drawer's running total"
            error={fieldErrors.unitPrice}
          />
          <TextInput
            label="Display order"
            name="displayOrder"
            inputMode="numeric"
            defaultValue={item ? String(item.displayOrder) : '0'}
            hint="Lower numbers appear first"
            error={fieldErrors.displayOrder}
          />
        </div>
      </form>
    </Modal>
  );
}
