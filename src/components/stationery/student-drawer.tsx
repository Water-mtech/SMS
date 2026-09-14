'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import type { MatrixStudent } from '@/components/stationery/class-matrix';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MIN_QUANTITY, commitQuantity, sanitiseQuantityInput } from '@/lib/quantity';
import type { StationeryItem } from '@/lib/types/database';
import { setStudentStationery } from '@/server/actions/stationery';

interface StudentStationeryDrawerProps {
  open: boolean;
  student: MatrixStudent | null;
  items: StationeryItem[];
  termId: string;
  /** item id -> quantity currently issued. */
  issued: Map<string, number>;
  onClose: () => void;
  onSaved: (studentId: string, issued: Map<string, number>) => void;
}

/**
 * Slide-over for one student: a "Select All" master checkbox plus one checkbox
 * per item, each with a quantity that defaults to 1 when the item is ticked.
 *
 * Nothing is written until Save, so a mis-click is undone by closing the panel.
 */
export function StudentStationeryDrawer({
  open,
  student,
  items,
  termId,
  issued,
  onClose,
  onSaved,
}: StudentStationeryDrawerProps) {
  const { toast } = useToast();
  // Values are the raw text in each box, not numbers: an empty string is a
  // valid in-progress state and only becomes a quantity when committed.
  const [selected, setSelected] = useState<Map<string, string>>(() =>
    new Map([...issued].map(([itemId, quantity]) => [itemId, String(quantity)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Re-seed the panel whenever it opens for a different student.
  useEffect(() => {
    if (open) {
      setSelected(new Map([...issued].map(([itemId, quantity]) => [itemId, String(quantity)])));
      setError(null);
    }
    // `issued` is a fresh Map on every render of the parent, so keying off the
    // student id keeps this from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?.studentId]);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someSelected = items.some((item) => selected.has(item.id));

  // "Some but not all" is a third state only the DOM property can express.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleItem(itemId: string) {
    setSelected((current) => {
      const next = new Map(current);
      // Ticking an item starts it at one; the clerk adjusts from there.
      if (next.has(itemId)) next.delete(itemId);
      else next.set(itemId, String(MIN_QUANTITY));
      return next;
    });
  }

  function setQuantity(itemId: string, raw: string) {
    setSelected((current) => {
      if (!current.has(itemId)) return current;
      const next = new Map(current);
      // Stored verbatim, empty included, so the box can be cleared and retyped.
      next.set(itemId, sanitiseQuantityInput(raw));
      return next;
    });
  }

  /** On blur an empty or out-of-range box settles on the value that will save. */
  function clampQuantity(itemId: string) {
    setSelected((current) => {
      const value = current.get(itemId);
      if (value === undefined) return current;
      const next = new Map(current);
      next.set(itemId, String(commitQuantity(value)));
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected
        ? new Map()
        : new Map(items.map((item) => [item.id, selected.get(item.id) ?? 1])),
    );
  }

  function save() {
    if (!student) return;
    setError(null);

    const payload = [...selected.entries()].map(([itemId, raw]) => ({
      itemId,
      quantity: commitQuantity(raw),
    }));

    startTransition(async () => {
      const result = await setStudentStationery({
        studentId: student.studentId,
        termId,
        items: payload,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSaved(
        student.studentId,
        new Map(result.data.issued.map((entry) => [entry.itemId, entry.quantity])),
      );
      toast(`Stationery updated for ${student.fullName}`, 'success');
      onClose();
    });
  }

  const totalUnits = [...selected.values()].reduce(
    (sum, raw) => sum + commitQuantity(raw),
    0,
  );

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
            <p className="text-xs text-slate-500">
              {totalUnits} item{totalUnits === 1 ? '' : 's'} in total
            </p>
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
            const quantity = selected.get(item.id);
            const checked = quantity !== undefined;

            return (
              <li key={item.id}>
                <div
                  className={[
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    checked ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(item.id)}
                      disabled={pending}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40"
                    />
                    <span className="truncate text-sm font-medium text-slate-900">{item.name}</span>
                  </label>

                  {/* The quantity box only appears once the item is ticked. */}
                  {checked && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <label htmlFor={`qty-${item.id}`} className="text-xs text-slate-500">
                        Qty
                      </label>
                      <input
                        id={`qty-${item.id}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        value={quantity}
                        disabled={pending}
                        onChange={(event) => setQuantity(item.id, event.target.value)}
                        onBlur={() => clampQuantity(item.id)}
                        aria-label={`Quantity of ${item.name}`}
                        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Drawer>
  );
}
