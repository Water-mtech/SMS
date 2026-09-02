import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PaymentHistory, type PaymentHistoryRow } from '@/components/fees/payment-history';
import { StudentForm } from '@/components/students/student-form';
import { buttonStyles } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { formatDate, formatNaira, formatTerm } from '@/lib/format';
import {
  getClasses,
  getCurrentTerm,
  getStudent,
  getStudentLedgerHistory,
  getStudentPayments,
} from '@/server/queries';

export const metadata: Metadata = { title: 'Student' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  const [classes, term, ledger, payments] = await Promise.all([
    getClasses(),
    getCurrentTerm(),
    getStudentLedgerHistory(id),
    getStudentPayments(id),
  ]);

  const fullName = [student.last_name, student.first_name, student.middle_name]
    .filter(Boolean)
    .join(' ');

  const receipts: PaymentHistoryRow[] = payments.map((payment) => ({
    id: payment.id,
    receiptNumber: payment.receipt_number,
    studentName: fullName,
    admissionNumber: student.admission_number,
    className: student.class.name,
    termLabel: payment.term?.label ?? 'first',
    sessionName: payment.term?.session?.name ?? '—',
    amountPaid: Number(payment.amount),
    balanceBefore: Number(payment.balance_before),
    balanceAfter: Number(payment.balance_after),
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paid_at,
    voided: payment.voided_at !== null,
    voidedReason: payment.voided_reason,
  }));

  return (
    <>
      <Link
        href="/students"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to students
      </Link>

      <PageHeader
        title={fullName}
        description={`${student.admission_number} · ${student.class.name} · ${student.class.section.name}`}
        action={
          <Link
            href={`/fees?class=${student.class.slug}`}
            className={buttonStyles({ variant: 'outline' })}
          >
            Open class ledger
          </Link>
        }
      />

      {student.archived_at && (
        <Alert tone="warning">
          This student is archived{student.archived_reason ? `: ${student.archived_reason}` : '.'} Their
          ledger and receipts are preserved.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Profile" />
          <dl className="divide-y divide-slate-100 text-sm">
            <Detail label="Status">
              <Badge tone={student.archived_at ? 'neutral' : 'success'} className="capitalize">
                {student.archived_at ? 'Archived' : student.status}
              </Badge>
            </Detail>
            <Detail label="Gender">{student.gender ?? '—'}</Detail>
            <Detail label="Date of birth">{formatDate(student.date_of_birth)}</Detail>
            <Detail label="Admitted">{formatDate(student.admitted_on)}</Detail>
            <Detail label="Guardian">{student.guardian_name ?? '—'}</Detail>
            <Detail label="Guardian phone">{student.guardian_phone ?? '—'}</Detail>
            <Detail label="Guardian email">{student.guardian_email ?? '—'}</Detail>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Ledger by term" description="Arrears carried in, this term's bill, and what has been paid." />
          {ledger.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No ledger has been opened for this student yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Fee ledger for each term.</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Term</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Arrears</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Bill</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Paid</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((account) => (
                    <tr key={account.id} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <span className="block font-medium text-slate-900">
                          {account.term ? formatTerm(account.term.label) : '—'}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {account.term?.session?.name} · {account.class?.name}
                        </span>
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatNaira(account.arrears)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatNaira(account.current_bill)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                        {formatNaira(account.total_paid)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                        {formatNaira(account.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Payment history" description="Every receipt issued against this student." />
        <PaymentHistory payments={receipts} />
      </Card>

      <Card>
        <CardHeader title="Edit details" />
        <div className="p-5">
          <StudentForm
            student={student}
            classes={classes.map((item) => ({
              id: item.id,
              name: item.name,
              sectionName: item.section.name,
            }))}
            termId={term?.id ?? null}
          />
        </div>
      </Card>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium capitalize text-slate-900">{children}</dd>
    </div>
  );
}
