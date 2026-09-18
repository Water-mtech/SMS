import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { FamilyChildrenPanel } from '@/components/families/family-children-panel';
import { FamilyFormModal } from '@/components/families/family-form-modal';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { formatDateTime, formatNaira, formatPaymentMethod, formatTerm } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import {
  getCurrentProfile,
  getFamily,
  getFamilyLedger,
  getFamilyPayments,
  getTerms,
  resolveTerm,
  type FamilyLedger,
} from '@/server/queries';

export const metadata: Metadata = { title: 'Family' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string }>;
}

/** No ledger to show: the figures read as zero and every control stays shut. */
const NO_LEDGER: FamilyLedger = {
  arrears: 0,
  currentBill: 0,
  totalPaid: 0,
  outstanding: 0,
  hasFee: false,
};

export default async function FamilyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { term: termParam } = await searchParams;

  const [term, profile, terms] = await Promise.all([
    resolveTerm(termParam),
    getCurrentProfile(),
    getTerms(),
  ]);
  if (!term) {
    return (
      <>
        <PageHeader title="Family" />
        <Alert tone="warning">No academic term has been configured yet.</Alert>
      </>
    );
  }

  // The household, its ledger and its receipts are three separate reads, and one
  // failing should not take the whole page down. An uncaught throw reaches the
  // error boundary, where production replaces the message with a generic string
  // -- which is how a missing table became "Something went wrong" with nothing
  // to act on. Settled rather than awaited in turn so the reads still overlap.
  const [familyLoad, ledgerLoad] = await Promise.allSettled([
    getFamily(id),
    getFamilyLedger(id, term.id),
  ]);

  if (familyLoad.status === 'rejected') {
    return (
      <>
        <PageHeader title="Family" />
        <Card className="p-5">
          <Alert>
            <p className="font-medium">This family could not be loaded.</p>
            <p className="mt-1 break-words font-mono text-xs">
              {errorMessage(familyLoad.reason)}
            </p>
          </Alert>
        </Card>
      </>
    );
  }

  const family = familyLoad.value;
  if (!family) notFound();

  const ledger = ledgerLoad.status === 'fulfilled' ? ledgerLoad.value : NO_LEDGER;
  const ledgerError = ledgerLoad.status === 'rejected' ? errorMessage(ledgerLoad.reason) : null;

  const canManage = profile?.role === 'admin' || profile?.role === 'bursar';
  // resolveTerm returns the bare row; the session name lives on the joined list.
  const sessionName = terms.find((item) => item.id === term.id)?.session?.name ?? '';

  return (
    <>
      <Link
        href="/families"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All families
      </Link>

      <PageHeader
        title={family.name}
        description={[family.phone, family.email].filter(Boolean).join(' · ') || undefined}
        action={canManage ? <FamilyFormModal family={family} /> : undefined}
      />

      {family.notes && <Alert tone="info">{family.notes}</Alert>}

      <Card className="overflow-hidden">
        <FamilyChildrenPanel
          familyId={family.id}
          familyName={family.name}
          pupils={family.children}
          arrears={ledger.arrears}
          currentBill={ledger.currentBill}
          totalPaid={ledger.totalPaid}
          outstanding={ledger.outstanding}
          hasFee={ledger.hasFee}
          ledgerError={ledgerError}
          termId={term.id}
          termLabel={term.label}
          sessionName={sessionName}
          canManage={canManage}
        />
      </Card>

      <FamilyPayments familyId={family.id} />
    </>
  );
}

async function FamilyPayments({ familyId }: { familyId: string }) {
  let payments;
  try {
    payments = await getFamilyPayments(familyId);
  } catch (error) {
    return (
      <Card className="p-5">
        <Alert>
          <p className="font-medium">This family&rsquo;s payments could not be loaded.</p>
          <p className="mt-1 break-words font-mono text-xs">{errorMessage(error)}</p>
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Family payments</h2>
        <p className="text-xs text-slate-500">
          Every payment taken against this household&rsquo;s fee.
        </p>
      </div>

      {payments.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No family payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Past payments covering several children.</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th scope="col" className="px-5 py-2 font-semibold text-slate-700">Receipt</th>
                <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Date</th>
                <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Method</th>
                <th scope="col" className="px-5 py-2 text-right font-semibold text-slate-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-5 py-2.5 font-medium text-slate-900">
                    {payment.receipt_number}
                    <span className="block text-xs font-normal text-slate-500">
                      {payment.term ? formatTerm(payment.term.label) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{formatDateTime(payment.paid_at)}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {formatPaymentMethod(payment.method)}
                    {payment.reference && (
                      <span className="block text-xs text-slate-500">{payment.reference}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className="font-semibold tabular-nums text-slate-900">
                      {formatNaira(Number(payment.total_amount))}
                    </span>
                    <span className="block text-xs text-slate-500">
                      outstanding {formatNaira(Number(payment.balance_after))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
