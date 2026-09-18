'use client';

import { Pencil, Search, UserMinus, UserPlus, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { FamilyFeeModal } from '@/components/families/family-fee-modal';
import { FamilyPaymentModal } from '@/components/families/family-payment-modal';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/overlay';
import { Alert, Badge, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatNaira } from '@/lib/format';
import type { TermLabel } from '@/lib/types/database';
import type { FamilyChild, UnassignedStudent } from '@/server/queries';
import { searchStudentsForFamilyAction, setStudentFamily } from '@/server/actions/families';

interface FamilyChildrenPanelProps {
  familyId: string;
  familyName: string;
  pupils: FamilyChild[];
  arrears: number;
  currentBill: number;
  totalPaid: number;
  outstanding: number;
  hasFee: boolean;
  termId: string;
  termLabel: TermLabel;
  sessionName: string;
  canManage: boolean;
}

/**
 * The children of one household: their ledgers, the controls to add or remove
 * a pupil, and the way in to a single payment covering all of them.
 */
export function FamilyChildrenPanel({
  familyId,
  familyName,
  pupils,
  arrears,
  currentBill,
  totalPaid,
  outstanding,
  hasFee,
  termId,
  termLabel,
  sessionName,
  canManage,
}: FamilyChildrenPanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [paying, setPaying] = useState(false);
  const [settingFee, setSettingFee] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<FamilyChild | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmRemove() {
    if (!removing) return;
    const child = removing;
    startTransition(async () => {
      const result = await setStudentFamily({ familyId: null, studentIds: [child.studentId] });
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast(`${child.fullName} removed from ${familyName}`, 'success');
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Household fees</h2>
          <p className="text-xs text-slate-500">
            One fee for the whole family, whatever classes the children are in.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add children
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingFee(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {hasFee ? 'Edit fee' : 'Set fee'}
            </Button>
            <Button size="sm" onClick={() => setPaying(true)} disabled={!hasFee}>
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Record payment
            </Button>
          </div>
        )}
      </div>

      {!hasFee ? (
        <div className="p-4">
          <Alert tone="warning">
            No fee has been set for this household yet. Set one before taking a payment.
          </Alert>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 text-center sm:grid-cols-4">
          <Figure label="Brought forward" value={formatNaira(arrears)} />
          <Figure label="This term" value={formatNaira(currentBill)} />
          <Figure label="Paid" value={formatNaira(totalPaid)} />
          <Figure
            label="Outstanding"
            value={formatNaira(outstanding)}
            emphasis
            tone={outstanding > 0 ? 'owing' : 'clear'}
          />
        </dl>
      )}

      <div className="border-b border-slate-200 px-5 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Children in this family
        </h3>
      </div>

      {pupils.length === 0 ? (
        <EmptyState
          title="No children in this family yet"
          description="Add each pupil of this household so their fees can be settled together."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">The children this household&rsquo;s fee covers.</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th scope="col" className="px-5 py-2 font-semibold text-slate-700">Pupil</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Class</th>
                  {canManage && <th scope="col" className="px-5 py-2" />}
                </tr>
              </thead>
              <tbody>
                {pupils.map((child) => (
                  <tr key={child.studentId} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/students/${child.studentId}`}
                        className="font-medium text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      >
                        {child.fullName}
                      </Link>
                      <span className="block text-xs text-slate-500">{child.admissionNumber}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{child.className}</td>
                    {canManage && (
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRemoving(child)}
                          aria-label={`Remove ${child.fullName} from this family`}
                        >
                          <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canManage && (
        <>
          <FamilyPaymentModal
            open={paying}
            onClose={() => setPaying(false)}
            familyId={familyId}
            familyName={familyName}
            pupils={pupils}
            outstanding={outstanding}
            termId={termId}
            termLabel={termLabel}
            sessionName={sessionName}
          />

          <FamilyFeeModal
            open={settingFee}
            onClose={() => setSettingFee(false)}
            familyId={familyId}
            familyName={familyName}
            termId={termId}
            arrears={arrears}
            currentBill={currentBill}
            totalPaid={totalPaid}
            outstanding={outstanding}
            hasFee={hasFee}
          />

          <AddChildrenModal
            open={adding}
            onClose={() => setAdding(false)}
            familyId={familyId}
            familyName={familyName}
            existing={new Set(pupils.map((child) => child.studentId))}
          />

          <Modal
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove from family"
            description={
              removing
                ? `${removing.fullName} will no longer be part of ${familyName}. Their own fees and receipts are untouched.`
                : undefined
            }
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRemoving(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmRemove} loading={pending}>
                  Remove
                </Button>
              </div>
            }
          >
            <p className="text-sm text-slate-600">
              You can add them back to this or any other family at any time.
            </p>
          </Modal>
        </>
      )}
    </>
  );
}

/** Search the roster and add several pupils to the household at once. */
function AddChildrenModal({
  open,
  onClose,
  familyId,
  familyName,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  familyId: string;
  familyName: string;
  existing: Set<string>;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UnassignedStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  function runSearch() {
    const term = search.trim();
    if (!term) return;
    setError(null);
    startSearch(async () => {
      const result = await searchStudentsForFamilyAction(term);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResults(result.data.filter((student) => !existing.has(student.id)));
      setSearched(true);
    });
  }

  function toggle(studentId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function save() {
    if (selected.size === 0) return;
    setError(null);
    startSave(async () => {
      const result = await setStudentFamily({ familyId, studentIds: [...selected] });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast(`${result.data.moved} pupil(s) added to ${familyName}`, 'success');
      setSelected(new Set());
      setResults([]);
      setSearch('');
      setSearched(false);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add children"
      description={`Search the roster and tick every pupil who belongs to ${familyName}.`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">{selected.size} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={selected.size === 0}>
              Add {selected.size > 0 ? selected.size : ''} to family
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex gap-2">
          <label htmlFor="pupil-search" className="sr-only">
            Search pupils by name or admission number
          </label>
          <input
            id="pupil-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runSearch();
              }
            }}
            placeholder="Surname, first name or admission number"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <Button variant="secondary" onClick={runSearch} loading={searching}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
        </div>

        <p className="text-xs text-slate-500">
          Siblings usually share a surname — searching it finds them all at once.
        </p>

        {searched && results.length === 0 && (
          <Alert tone="info">No other pupils match that search.</Alert>
        )}

        {results.length > 0 && (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {results.map((student) => (
              <li key={student.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(student.id)}
                    onChange={() => toggle(student.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-900">{student.fullName}</span>
                    <span className="block text-xs text-slate-500">
                      {student.admissionNumber} · {student.className}
                    </span>
                  </span>
                  {student.familyId && (
                    <Badge tone="warning">In {student.familyName ?? 'another family'}</Badge>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'owing' | 'clear';
}) {
  return (
    <div className="bg-white px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={
          emphasis
            ? `mt-0.5 text-sm font-bold ${tone === 'clear' ? 'text-brand-700' : 'text-slate-900'}`
            : 'mt-0.5 text-sm text-slate-700'
        }
      >
        {value}
      </dd>
    </div>
  );
}
