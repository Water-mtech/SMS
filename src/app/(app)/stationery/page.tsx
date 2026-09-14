import type { Metadata } from 'next';
import Link from 'next/link';
import { PackagePlus } from 'lucide-react';

import { ClassMatrix } from '@/components/stationery/class-matrix';
import { QuerySelect } from '@/components/filters/query-select';
import { buttonStyles } from '@/components/ui/button';
import { Card, PageHeader, Alert } from '@/components/ui/primitives';
import { formatTerm } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { getClassMatrix, getClasses, getStationeryItems, getTerms, resolveTerm } from '@/server/queries';

export const metadata: Metadata = { title: 'Stationery' };

interface PageProps {
  searchParams: Promise<{ class?: string; term?: string }>;
}

export default async function StationeryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [classes, terms] = await Promise.all([getClasses(), getTerms()]);

  const currentClass = classes.find((item) => item.slug === params.class) ?? classes[0];
  const term = await resolveTerm(params.term);

  return (
    <>
      <PageHeader
        title="Stationery tracking"
        description="Track, class by class, exactly which items each student has collected this term."
        action={
          <Link href="/stationery/items" className={buttonStyles({ variant: 'outline' })}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Manage items
          </Link>
        }
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
        <Alert tone="warning">
          No academic term has been configured yet. Add a session and its terms before tracking
          stationery.
        </Alert>
      ) : !currentClass ? (
        <Alert tone="warning">No classes have been set up yet.</Alert>
      ) : (
        <MatrixPanel classId={currentClass.id} className={currentClass.name} termId={term.id} />
      )}
    </>
  );
}

async function MatrixPanel({
  classId,
  className,
  termId,
}: {
  classId: string;
  className: string;
  termId: string;
}) {
  // Same reasoning as the catalogue panel: show why the grid is missing rather
  // than letting the boundary swallow the message in production.
  let items;
  let matrix;
  try {
    [items, matrix] = await Promise.all([getStationeryItems(), getClassMatrix(classId, termId)]);
  } catch (error) {
    return (
      <Card className="p-5">
        <Alert>
          <p className="font-medium">The class matrix could not be loaded.</p>
          <p className="mt-1 break-words font-mono text-xs">{errorMessage(error)}</p>
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ClassMatrix
        className={className}
        termId={termId}
        items={items}
        students={matrix.map((row) => ({
          studentId: row.studentId,
          admissionNumber: row.admissionNumber,
          fullName: row.fullName,
          issued: [...row.issued.entries()],
        }))}
      />
    </Card>
  );
}
