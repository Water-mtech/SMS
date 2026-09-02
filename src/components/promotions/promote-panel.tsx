'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ArrowRight, GraduationCap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatNaira } from '@/lib/format';
import { previewPromotion, promoteClass } from '@/server/actions/promotions';

export interface PromotableClass {
  id: string;
  name: string;
  sectionName: string;
  promotionOrder: number;
  isTerminal: boolean;
}

export interface TermOption {
  id: string;
  label: string;
  sequence: number;
}

interface PromotePanelProps {
  classes: PromotableClass[];
  terms: TermOption[];
  defaultFromTermId: string;
}

/**
 * Whole-class promotion.
 *
 * The panel resolves the destination class from `promotion_order`, previews how
 * many students move and what they still owe, then hands the write to
 * `promote_class`, which does the move and the arrears roll-over atomically.
 */
export function PromotePanel({ classes, terms, defaultFromTermId }: PromotePanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [fromClassId, setFromClassId] = useState(classes[0]?.id ?? '');
  const [fromTermId, setFromTermId] = useState(defaultFromTermId);
  const [toTermId, setToTermId] = useState('');
  const [preview, setPreview] = useState<{ students: number; outstanding: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fromClass = classes.find((item) => item.id === fromClassId);
  const fromTerm = terms.find((item) => item.id === fromTermId);
  const toClass = fromClass?.isTerminal
    ? null
    : classes.find((item) => item.promotionOrder === (fromClass?.promotionOrder ?? 0) + 1);

  // Only terms after the one being closed can receive a promotion.
  const destinationTerms = terms.filter((item) => item.sequence > (fromTerm?.sequence ?? 0));

  useEffect(() => {
    if (!destinationTerms.some((item) => item.id === toTermId)) {
      setToTermId(destinationTerms[0]?.id ?? '');
    }
  }, [destinationTerms, toTermId]);

  useEffect(() => {
    if (!fromClassId || !fromTermId) return;
    let cancelled = false;

    void previewPromotion(fromClassId, fromTermId).then((result) => {
      if (cancelled) return;
      setPreview(result.ok ? result.data : null);
    });

    return () => {
      cancelled = true;
    };
  }, [fromClassId, fromTermId]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await promoteClass({ fromClassId, fromTermId, toTermId });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const { promoted, graduated, rolledOver } = result.data;
      toast(
        graduated > 0
          ? `${graduated} student(s) graduated`
          : `${promoted} student(s) promoted · ${formatNaira(rolledOver)} rolled over`,
        'success',
      );
      setConfirming(false);
      router.refresh();
    });
  }

  const ready = Boolean(fromClassId && fromTermId && toTermId);

  return (
    <>
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <SelectInput
          label="Class to promote"
          value={fromClassId}
          onChange={(event) => setFromClassId(event.target.value)}
          options={classes.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.sectionName}`,
          }))}
        />
        <SelectInput
          label="Closing term"
          value={fromTermId}
          onChange={(event) => setFromTermId(event.target.value)}
          options={terms.map((item) => ({ value: item.id, label: item.label }))}
          hint="Unpaid balances from this term roll forward"
        />
        <SelectInput
          label="Into term"
          value={toTermId}
          onChange={(event) => setToTermId(event.target.value)}
          options={destinationTerms.map((item) => ({ value: item.id, label: item.label }))}
          placeholder={destinationTerms.length === 0 ? 'No later term available' : undefined}
        />
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-lg bg-white px-3 py-2 font-medium text-slate-900 ring-1 ring-slate-200">
              {fromClass?.name ?? '—'}
            </span>
            {fromClass?.isTerminal ? (
              <>
                <GraduationCap className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="rounded-lg bg-white px-3 py-2 font-medium text-slate-900 ring-1 ring-slate-200">
                  Graduated
                </span>
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="rounded-lg bg-white px-3 py-2 font-medium text-slate-900 ring-1 ring-slate-200">
                  {toClass?.name ?? '—'}
                </span>
              </>
            )}
          </div>

          <div className="text-sm text-slate-600">
            {preview ? (
              <>
                <strong className="text-slate-900">{preview.students}</strong> student(s) ·{' '}
                <strong className="text-slate-900">{formatNaira(preview.outstanding)}</strong> to roll
                over
              </>
            ) : (
              'Calculating…'
            )}
          </div>

          <Button onClick={() => setConfirming(true)} disabled={!ready}>
            Promote class
          </Button>
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirm promotion"
        description="This cannot be undone from the app."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={confirm} loading={pending}>
              Yes, promote
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          {error && <Alert>{error}</Alert>}
          <p>
            {preview?.students ?? 0} active student(s) in <strong>{fromClass?.name}</strong> will
            {fromClass?.isTerminal ? ' be marked as graduated' : ` move to ${toClass?.name}`}.
          </p>
          {!fromClass?.isTerminal && (
            <p>
              Any uncleared balance — currently {formatNaira(preview?.outstanding ?? 0)} in total —
              becomes arrears on their new term ledger, on top of that class&apos;s published bill.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Promotions are recorded as a batch, so running the same promotion twice is rejected rather
            than double-charging arrears.
          </p>
        </div>
      </Modal>
    </>
  );
}
