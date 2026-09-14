import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { QuerySelect } from '@/components/filters/query-select';
import { CatalogueManager, type CatalogueRow } from '@/components/stationery/catalogue-manager';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { getCurrentProfile, getSections, getStationeryCatalogue } from '@/server/queries';

export const metadata: Metadata = { title: 'Stationery items' };

interface PageProps {
  searchParams: Promise<{ section?: string }>;
}

export default async function StationeryItemsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [sections, profile] = await Promise.all([getSections(), getCurrentProfile()]);

  const section = sections.find((item) => item.slug === params.section) ?? sections[0];
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
        description="Set up what each section issues. These items become the columns of the class matrix and the checkboxes in the student drawer."
      />

      {!section ? (
        <Alert tone="warning">No sections have been configured yet.</Alert>
      ) : (
        <>
          <Card className="p-4">
            <div className="max-w-sm">
              <QuerySelect
                label="Section"
                param="section"
                value={section.slug}
                options={sections.map((item) => ({ value: item.slug, label: item.name }))}
              />
            </div>
          </Card>

          {!canManage && (
            <Alert tone="info">
              You can view this catalogue, but only an administrator can add or change items.
            </Alert>
          )}

          <CataloguePanel
            sectionId={section.id}
            sectionName={section.name}
            canManage={canManage}
          />
        </>
      )}
    </>
  );
}

async function CataloguePanel({
  sectionId,
  sectionName,
  canManage,
}: {
  sectionId: string;
  sectionName: string;
  canManage: boolean;
}) {
  const items = await getStationeryCatalogue(sectionId);

  const rows: CatalogueRow[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    unitPrice: Number(item.unit_price),
    displayOrder: item.display_order,
    isActive: item.is_active,
    issuedCount: item.issuedCount,
  }));

  return (
    <Card className="overflow-hidden">
      <CatalogueManager
        items={rows}
        sectionId={sectionId}
        sectionName={sectionName}
        canManage={canManage}
      />
    </Card>
  );
}
