'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import type { MatrixStudent } from '@/components/stationery/class-matrix';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatNaira } from '@/lib/format';
import type { StationeryItem } from '@/lib/types/database';
import { setStudentStationery } from '@/server/actions/stationery';

interface StudentStationeryDrawerProps {
  open: boolean;
  student: MatrixStudent | null;
  items: StationeryItem[];
  termId: string;
  selectedItemIds: Set<string>;
  onClose: () => void;
  onSaved: (studentId: string, itemIds: string[]) => void;
}

/**
 * Slide-over for one student: a "Select All" master checkbox plus one checkbox
 * per item. Nothing is written until Save, so a mis-click is trivially undone
 * by closing the panel.
 */
export function StudentStationeryDrawer({
  open,
  student,
  items,
  termId,
  selectedItemIds,
  onClose,
  onSaved,
}: StudentStationeryDrawerProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(selectedItemIds);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Re-seed the panel whenever it opens for a different student.
  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedItemIds));
      setError(null);
    }
    // `selectedItemIds` is a fresh Set on every render of the parent, so keying
    // off the student id keeps this from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?.studentId]);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someSelected = items.some((item) => selected.has(item.id));

  // "Some but not all" is a third state that only the DOM property can express.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleItem(itemId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  function save() {
    if (!student) return;
    setError(null);

    const itemIds = [...selected];
    startTransition(async () => {
      const result = await setStudentStationery({
        studentId: student.studentId,
        termId,
        itemIds,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSaved(student.studentId, result.data.issuedItemIds);
      toast(`Stationery updated for ${student.fullName}`, 'success');
      onClose();
    });
  }

  const selectedValue = items
    .filter((item) => selected.has(item.id))
    .reduce((sum, item) => sum + Number(item.unit_price), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={student?.fullName ?? 'Student'}
      description={student ? `${student.admissionNumber} · issue stationery` : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium text-slate-900">
              {selected.size} of {items.length} selected
            </p>
            <p className="text-xs text-slate-500">Value {formatNaira(selectedValue)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending}>
              Save changes
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={items.length === 0 || pending}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40"
          />
          <span className="text-sm font-semibold text-slate-900">Select all items</span>
        </label>

        <ul className="space-y-1.5">
          {items.map((item) => {
            const checked = selected.has(item.id);
            return (
              <li key={item.id}>
                <label
                  className={[
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    checked
                      ? 'border-brand-200 bg-brand-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.id)}
                    disabled={pending}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{item.name}</span>
                    {item.description && (
                      <span className="block text-xs text-slate-500">{item.description}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    {formatNaira(item.unit_price)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </Drawer>
  );
}
