import type { Metadata } from 'next';

import { QuerySelect } from '@/components/filters/query-select';
import { StructureEditor, type StructureRow } from '@/components/fees/structure-editor';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { formatTerm } from '@/lib/format';
import { getClasses, getFeeStructures, getTerms, resolveTerm } from '@/server/queries';

export const metadata: Metadata = { title: 'Fee Structures' };

interface PageProps {
  searchParams: Promise<{ term?: string }>;
}

export default async function FeeStructuresPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [classes, terms] = await Promise.all([getClasses(), getTerms()]);
  const term = await resolveTerm(params.term);

  if (!term) {
    return (
      <>
        <PageHeader title="Fee structures" />
        <Alert tone="warning">Configure an academic session and its terms first.</Alert>
      </>
    );
  }

  const structures = await getFeeStructures(term.id);
  const byClass = new Map(structures.map((structure) => [structure.class_id, structure]));

  const rows: StructureRow[] = classes.map((item) => ({
    classId: item.id,
    className: item.name,
    sectionName: item.section.name,
    amount: Number(byClass.get(item.id)?.amount ?? 0),
    description: byClass.get(item.id)?.description ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Fee structures"
        description="Set what each class is billed this term. Saving a row applies the amount to every active student in that class."
      />

      <Card className="p-4">
        <div className="max-w-sm">
          <QuerySelect
            label="Term"
            param="term"
            value={term.id}
            options={terms.map((item) => ({
              value: item.id,
              label: `${formatTerm(item.label)} · ${item.session.name}`,
            }))}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title={`${formatTerm(term.label)} fee schedule`}
          description="Amounts are applied to current_bill; existing payments and arrears are never overwritten."
        />
        <StructureEditor rows={rows} termId={term.id} />
      </Card>
    </>
  );
}
