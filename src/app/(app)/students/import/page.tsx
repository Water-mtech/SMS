import type { Metadata } from 'next';

import { ImportWizard } from '@/components/students/import-wizard';
import { PageHeader } from '@/components/ui/primitives';
import { getClasses, getCurrentTerm } from '@/server/queries';

export const metadata: Metadata = { title: 'Import roster' };

interface PageProps {
  searchParams: Promise<{ class?: string }>;
}

export default async function ImportStudentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [classes, term] = await Promise.all([getClasses(), getCurrentTerm()]);
  const defaultClass = classes.find((item) => item.slug === params.class);

  return (
    <>
      <PageHeader
        title="Bulk import"
        description="Import a whole class from a spreadsheet. Everything is validated before a single row is written."
      />

      <ImportWizard
        classes={classes.map((item) => ({
          id: item.id,
          name: item.name,
          sectionName: item.section.name,
        }))}
        termId={term?.id ?? null}
        defaultClassId={defaultClass?.id}
      />
    </>
  );
}
