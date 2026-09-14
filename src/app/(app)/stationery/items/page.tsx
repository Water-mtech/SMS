import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { CatalogueManager, type CatalogueRow } from '@/components/stationery/catalogue-manager';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/utils';
import { getCurrentProfile, getStationeryCatalogue } from '@/server/queries';

export const metadata: Metadata = { title: 'Stationery items' };

export default async function StationeryItemsPage() {
  const profile = await getCurrentProfile();
  const canManage = profile?.role === 'admin';

  return (
    <>
      <Link
        href="/stationery"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to the class matrix
      </Link>

      <PageHeader
        title="Stationery items"
        description="One catalogue for the whole school. Every item is offered for every student; staff tick the ones that apply."
      />

      {!canManage && (
        <Alert tone="info">
          You can view this catalogue, but only an administrator can add or change items.
        </Alert>
      )}

      <CataloguePanel canManage={canManage} />
    </>
  );
}

async function CataloguePanel({ canManage }: { canManage: boolean }) {
  // Caught here rather than left to the error boundary: an uncaught throw is
  // replaced by a generic string in production, which tells the operator
  // nothing. Rendering the reason keeps the rest of the page usable.
  let items;
  try {
    items = await getStationeryCatalogue();
  } catch (error) {
    return (
      <Card className="p-5">
        <Alert>
          <p className="font-medium">The catalogue could not be loaded.</p>
          <p className="mt-1 break-words font-mono text-xs">{errorMessage(error)}</p>
        </Alert>
      </Card>
    );
  }

  const rows: CatalogueRow[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    displayOrder: item.display_order,
    isActive: item.is_active,
    issuedCount: item.issuedCount,
  }));

  return (
    <Card className="overflow-hidden">
      <CatalogueManager items={rows} canManage={canManage} />
    </Card>
  );
}
