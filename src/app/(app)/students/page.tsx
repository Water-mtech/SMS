import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';

import { StudentsTable, type StudentRow } from '@/components/students/students-table';
import { Button, buttonStyles } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/primitives';
import { getClasses, listStudents } from '@/server/queries';

export const metadata: Metadata = { title: 'Students' };

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ class?: string; q?: string; archived?: string; page?: string }>;
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const classes = await getClasses();

  const selectedClass = classes.find((item) => item.slug === params.class);
  const includeArchived = params.archived === 'true';
  const page = Math.max(Number.parseInt(params.page ?? '1', 10) || 1, 1);

  const { students, total } = await listStudents({
    classId: selectedClass?.id,
    search: params.q,
    includeArchived,
    page,
    pageSize: PAGE_SIZE,
  });

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <>
      <PageHeader
        title="Students"
        description={`${total} record${total === 1 ? '' : 's'} in this view.`}
        action={
          <div className="flex gap-2">
            <Link href="/students/import" className={buttonStyles({ variant: 'outline' })}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Bulk import
            </Link>
            <Link href="/students/new" className={buttonStyles()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Register student
            </Link>
          </div>
        }
      />

      <Card className="p-4">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <div className="space-y-1.5">
            <label htmlFor="student-search" className="block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="student-search"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder="Name, admission number or guardian"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="class-filter" className="block text-sm font-medium text-slate-700">
              Class
            </label>
            <select
              id="class-filter"
              name="class"
              defaultValue={params.class ?? ''}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">All classes</option>
              {classes.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name} · {item.section.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="archived"
                value="true"
                defaultChecked={includeArchived}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40"
              />
              Include archived
            </label>
          </div>

          <div className="flex items-end">
            <Button type="submit" variant="outline" className="w-full sm:w-auto">
              Apply filters
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <StudentsTable students={students as StudentRow[]} />
      </Card>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <p className="text-sm text-slate-500">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            <PageLink params={params} page={page - 1} disabled={page <= 1} label="Previous" />
            <PageLink params={params} page={page + 1} disabled={page >= pageCount} label="Next" />
          </div>
        </nav>
      )}
    </>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-300">
        {label}
      </span>
    );
  }

  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  search.set('page', String(page));

  return (
    <Link
      href={`/students?${search.toString()}`}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      {label}
    </Link>
  );
}
