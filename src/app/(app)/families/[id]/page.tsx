import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { FamilyChildrenPanel } from '@/components/families/family-children-panel';
import { FamilyFormModal } from '@/components/families/family-form-modal';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { formatDateTime, formatNaira, formatTerm } from '@/lib/format';
import {
  getCurrentProfile,
  getFamily,
  getFamilyPayments,
  getTerms,
  resolveTerm,
} from '@/server/queries';

export const metadata: Metadata = { title: 'Family' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string }>;
}

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

  const [family, payments] = await Promise.all([getFamily(id, term.id), getFamilyPayments(id)]);
  if (!family) notFound();

  const canManage = profile?.role === 'admin' || profile?.role === 'bursar';
  // resolveTerm returns the bare row; the session name lives on the joined list.
  const sessionName = terms.find((item) => item.id === term.id)?.session.name ?? '';

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
          outstanding={family.outstanding}
          termId={term.id}
          termLabel={term.label}
          sessionName={sessionName}
          canManage={canManage}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Family payments</h2>
          <p className="text-xs text-slate-500">
            Handovers covering more than one child. Payments made for a single pupil appear on that
            pupil&rsquo;s own record.
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
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Covered</th>
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
                      <ul className="space-y-0.5">
                        {payment.payments.map((slip) => (
                          <li key={slip.id} className={slip.voided_at ? 'line-through opacity-60' : undefined}>
                            {[slip.student?.last_name, slip.student?.first_name]
                              .filter(Boolean)
                              .join(' ')}{' '}
                            <span className="tabular-nums">{formatNaira(Number(slip.amount))}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatNaira(Number(payment.total_amount))}
                      </span>
                      <span className="block text-xs text-slate-500">
                        left {formatNaira(Number(payment.balance_after))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
