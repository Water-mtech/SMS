import type { Metadata } from 'next';

import { QuerySelect } from '@/components/filters/query-select';
import { ApplyStructureButton } from '@/components/fees/apply-structure-button';
import { LedgerTable } from '@/components/fees/ledger-table';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { formatTerm } from '@/lib/format';
import {
  getClassLedger,
  getClasses,
  getCurrentProfile,
  getTerms,
  resolveTerm,
} from '@/server/queries';

export const metadata: Metadata = { title: 'Fees & Payments' };

interface PageProps {
  searchParams: Promise<{ class?: string; term?: string }>;
}

export default async function FeesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [classes, terms, profile] = await Promise.all([
    getClasses(),
    getTerms(),
    getCurrentProfile(),
  ]);

  const currentClass = classes.find((item) => item.slug === params.class) ?? classes[0];
  const term = await resolveTerm(params.term);
  const canRecordPayments = profile?.role === 'admin' || profile?.role === 'bursar';

  return (
    <>
      <PageHeader
        title="Fees & payments"
        description="Arrears and this term's bill, side by side, with instant receipts on every payment."
      />

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <QuerySelect
            label="Class"
            param="class"
            value={currentClass?.slug ?? ''}
            options={classes.map((item) => ({
              value: item.slug,
              label: `${item.name} · ${item.section.name}`,
            }))}
          />
          <QuerySelect
            label="Term"
            param="term"
            value={term?.id ?? ''}
            options={terms.map((item) => ({
              value: item.id,
              label: `${formatTerm(item.label)} · ${item.session.name}`,
            }))}
          />
        </div>
      </Card>

      {!term ? (
        <Alert tone="warning">No academic term has been configured yet.</Alert>
      ) : !currentClass ? (
        <Alert tone="warning">No classes have been set up yet.</Alert>
      ) : (
        <>
          {!canRecordPayments && (
            <Alert tone="info">
              You can view this ledger, but only an administrator or bursar can record payments.
            </Alert>
          )}
          <LedgerPanel
            classId={currentClass.id}
            className={currentClass.name}
            termId={term.id}
            canRecordPayments={canRecordPayments}
          />
        </>
      )}
    </>
  );
}

async function LedgerPanel({
  classId,
  className,
  termId,
  canRecordPayments,
}: {
  classId: string;
  className: string;
  termId: string;
  canRecordPayments: boolean;
}) {
  const rows = await getClassLedger(classId, termId);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{className} ledger</h2>
        <ApplyStructureButton classId={classId} termId={termId} />
      </div>
      <LedgerTable
        rows={rows}
        termId={termId}
        classId={classId}
        canRecordPayments={canRecordPayments}
      />
    </Card>
  );
}
