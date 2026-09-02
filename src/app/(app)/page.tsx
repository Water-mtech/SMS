import Link from 'next/link';
import { BookOpen, Coins, TrendingUp, Users, Wallet } from 'lucide-react';

import { buttonStyles } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { formatDateTime, formatNaira, formatNairaCompact, formatTerm } from '@/lib/format';
import { getCurrentTerm, getDashboardStats, getRecentPayments } from '@/server/queries';

export default async function DashboardPage() {
  const term = await getCurrentTerm();

  if (!term) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Alert tone="warning">
          No academic term is marked as current. Configure a session and its terms to start tracking
          stationery and fees.
        </Alert>
      </>
    );
  }

  const [stats, recentPayments] = await Promise.all([
    getDashboardStats(term.id),
    getRecentPayments(term.id),
  ]);

  const collectionRate =
    stats.expectedRevenue > 0 ? Math.round((stats.collectedRevenue / stats.expectedRevenue) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${formatTerm(term.label)} · ${stats.activeStudents} active students`}
        action={
          <Link href="/fees" className={buttonStyles()}>
            Record a payment
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label="Active students"
          value={String(stats.activeStudents)}
          detail={`${stats.studentsFullyCleared} fully cleared`}
        />
        <Stat
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          label="Expected this term"
          value={formatNairaCompact(stats.expectedRevenue)}
          detail={formatNaira(stats.expectedRevenue)}
        />
        <Stat
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          label="Collected"
          value={formatNairaCompact(stats.collectedRevenue)}
          detail={`${collectionRate}% of expected`}
          tone="success"
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="Outstanding"
          value={formatNairaCompact(stats.outstandingRevenue)}
          detail={formatNaira(stats.outstandingRevenue)}
          tone={stats.outstandingRevenue > 0 ? 'warning' : 'success'}
        />
      </div>

      <Card>
        <CardHeader
          title="Fee collection"
          description={`${collectionRate}% of this term's expected revenue has been received.`}
        />
        <div className="p-5">
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={collectionRate}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Fee collection progress"
          >
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.min(collectionRate, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{formatNaira(stats.collectedRevenue)} collected</span>
            <span>{formatNaira(stats.outstandingRevenue)} outstanding</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader
            title="Recent payments"
            description="The latest receipts issued this term."
            action={
              <Link href="/fees" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
                Open ledger
              </Link>
            }
          />
          {recentPayments.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-8 w-8" />}
              title="No payments yet this term"
              description="Receipts appear here as soon as the first payment is recorded."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {payment.student
                        ? `${payment.student.last_name} ${payment.student.first_name}`
                        : 'Unknown student'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {payment.receipt_number} · {payment.student?.class?.name ?? '—'} ·{' '}
                      {formatDateTime(payment.paid_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatNaira(payment.amount)}
                    </p>
                    {Number(payment.balance_after) <= 0 ? (
                      <Badge tone="success">Cleared</Badge>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {formatNaira(payment.balance_after)} left
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Stationery" description="Items issued across all sections this term." />
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
            <BookOpen className="h-8 w-8 text-brand-500" aria-hidden="true" />
            <p className="text-3xl font-semibold text-slate-900">{stats.itemsIssued}</p>
            <p className="text-sm text-slate-500">items issued to students</p>
            <Link
              href="/stationery"
              className={buttonStyles({ variant: 'outline', size: 'sm', className: 'mt-2' })}
            >
              Open class matrix
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const toneClasses = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
  } as const;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          {icon}
        </span>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
    </Card>
  );
}
