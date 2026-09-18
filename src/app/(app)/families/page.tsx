import type { Metadata } from 'next';
import Link from 'next/link';

import { FamilyFormModal } from '@/components/families/family-form-modal';
import { buttonStyles } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { formatNaira } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { getCurrentProfile, listFamilies, type FamilySummary } from '@/server/queries';

export const metadata: Metadata = { title: 'Families' };

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function FamiliesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  const canManage = profile?.role === 'admin' || profile?.role === 'bursar';

  // Caught here rather than left to the error boundary: production replaces an
  // uncaught Server Component error with a generic string, which tells the
  // operator nothing. Rendering the reason keeps the page usable.
  let families: FamilySummary[] = [];
  let loadError: string | null = null;
  try {
    families = await listFamilies(params.q);
  } catch (error) {
    loadError = errorMessage(error);
  }

  const totalOutstanding = families.reduce((sum, family) => sum + family.outstanding, 0);

  return (
    <>
      <PageHeader
        title="Families"
        description="Siblings grouped behind one guardian, so a parent can settle every child in a single payment."
        action={canManage ? <FamilyFormModal /> : undefined}
      />

      {!canManage && (
        <Alert tone="info">
          You can view families, but only an administrator or bursar can group pupils or take
          payments.
        </Alert>
      )}

      <Card className="p-4">
        <form className="flex flex-wrap gap-2" action="/families">
          <label htmlFor="family-search" className="sr-only">
            Search families
          </label>
          <input
            id="family-search"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search by guardian name or phone"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button type="submit" className={buttonStyles({ variant: 'secondary' })}>
            Search
          </button>
          {params.q && (
            <Link href="/families" className={buttonStyles({ variant: 'outline' })}>
              Clear
            </Link>
          )}
        </form>
      </Card>

      {loadError !== null ? (
        <Card className="p-5">
          <Alert>
            <p className="font-medium">Families could not be loaded.</p>
            <p className="mt-1 break-words font-mono text-xs">{loadError}</p>
          </Alert>
        </Card>
      ) : families.length === 0 ? (
        <EmptyState
          title={params.q ? 'No families match that search' : 'No families yet'}
          description={
            params.q
              ? 'Try the guardian’s name or phone number.'
              : 'Create a family, then add each of their children to it. Fees stay on each pupil’s own ledger — a family only lets you see and settle them together.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {families.length} famil{families.length === 1 ? 'y' : 'ies'}
            </h2>
            <p className="text-sm text-slate-600">
              Owing in total{' '}
              <strong className="text-slate-900">{formatNaira(totalOutstanding)}</strong>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Families and what each household still owes.</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th scope="col" className="px-5 py-2 font-semibold text-slate-700">Guardian</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Phone</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-700">Children</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold text-slate-700">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {families.map((family) => (
                  <tr key={family.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/families/${family.id}`}
                        className="font-medium text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      >
                        {family.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{family.phone ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {family.children}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {family.outstanding > 0 ? (
                        <span className="font-semibold tabular-nums text-slate-900">
                          {formatNaira(family.outstanding)}
                        </span>
                      ) : (
                        <Badge tone="success">Cleared</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
