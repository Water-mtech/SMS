import type { Metadata } from 'next';

import { StudentForm } from '@/components/students/student-form';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { getClasses, getCurrentTerm } from '@/server/queries';

export const metadata: Metadata = { title: 'Register student' };

interface PageProps {
  searchParams: Promise<{ class?: string }>;
}

export default async function NewStudentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [classes, term] = await Promise.all([getClasses(), getCurrentTerm()]);
  const defaultClass = classes.find((item) => item.slug === params.class);

  return (
    <>
      <PageHeader
        title="Register a student"
        description="The student's ledger for the current term opens automatically once their class has a published fee structure."
      />

      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader title="Student details" />
        <div className="p-5">
          <StudentForm
            classes={classes.map((item) => ({
              id: item.id,
              name: item.name,
              sectionName: item.section.name,
            }))}
            termId={term?.id ?? null}
            defaultClassId={defaultClass?.id}
          />
        </div>
      </Card>
    </>
  );
}
