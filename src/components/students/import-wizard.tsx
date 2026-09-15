'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/field';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { groupRowsByClass } from '@/lib/roster/grouping';
import {
  importTemplateCsv,
  parseRosterFile,
  type ParsedImportRow,
  type ParseResult,
} from '@/lib/roster/import';
import { errorMessage } from '@/lib/utils';
import { bulkImportStudentsByClass } from '@/server/actions/students';

interface ImportWizardProps {
  classes: { id: string; name: string; sectionName: string }[];
  termId: string | null;
  defaultClassId?: string;
}

const PREVIEW_LIMIT = 10;

/**
 * Three-step bulk import: pick the class, drop a CSV/Excel file, review the
 * parsed rows, then commit. Parsing and validation happen locally so nothing
 * reaches the database until the user has seen exactly what will be created.
 *
 * A file may carry its own `class` column, in which case the whole school goes
 * in as one upload and the class picked on screen only covers rows that leave
 * it blank.
 */
export function ImportWizard({ classes, termId, defaultClassId }: ImportWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classId, setClassId] = useState(defaultClassId ?? classes[0]?.id ?? '');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onFileSelected(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    setParsed(null);
    setFileName(file.name);

    try {
      setParsed(await parseRosterFile(file));
    } catch (error) {
      setParseError(errorMessage(error, 'That file could not be read'));
    } finally {
      setParsing(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Rows carrying their own class are routed by it; the rest fall back to the
  // class chosen above. Recomputed as the picker changes so the summary is live.
  const grouping = useMemo(() => {
    if (!parsed) return null;
    const fallback = classes.find((item) => item.id === classId) ?? null;
    return groupRowsByClass(parsed.rows, classes, fallback);
  }, [parsed, classes, classId]);

  const readyCount = grouping?.groups.reduce((total, group) => total + group.rows.length, 0) ?? 0;
  const unmatched = grouping?.unmatched ?? [];

  // Flatten just enough of the grouped rows to fill the preview table, so the
  // preview shows the class each student will actually land in.
  const previewRows = useMemo(() => {
    const preview: { row: ParsedImportRow; className: string }[] = [];
    for (const group of grouping?.groups ?? []) {
      for (const row of group.rows) {
        if (preview.length >= PREVIEW_LIMIT) return preview;
        preview.push({ row, className: group.target.name });
      }
    }
    return preview;
  }, [grouping]);
  const spansClasses = (grouping?.groups.length ?? 0) > 1;

  function commit() {
    if (!grouping || !termId || grouping.groups.length === 0) return;

    startTransition(async () => {
      const result = await bulkImportStudentsByClass({
        termId,
        groups: grouping.groups.map((group) => ({
          classId: group.target.id,
          className: group.target.name,
          rows: group.rows,
        })),
      });

      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }

      const { imported, skipped, failed } = result.data;
      if (failed.length > 0) {
        toast(
          `${imported} imported. ${failed.length} class(es) failed: ${failed
            .map((item) => `${item.className} — ${item.message}`)
            .join('; ')}`,
          'error',
        );
      } else {
        toast(
          skipped > 0
            ? `${imported} student(s) imported, ${skipped} skipped as duplicates`
            : `${imported} student(s) imported`,
          'success',
        );
      }

      const only = grouping.groups[0];
      router.push(spansClasses || !only ? '/students' : `/students?class=${only.target.id}`);
      router.refresh();
    });
  }

  const canCommit = Boolean(grouping && grouping.groups.length > 0 && termId && !pending);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="1. Choose the destination class"
          description={
            spansClasses
              ? 'Your file has a class column, so each row goes to its own class. This picker only covers rows that leave it blank.'
              : 'Every row without a class column of its own is imported into this class.'
          }
        />
        <div className="max-w-sm p-5">
          <SelectInput
            label="Class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            options={classes.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.sectionName}`,
            }))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="2. Upload the roster"
          description="CSV, XLSX or XLS. Column names are matched flexibly — 'Surname', 'Last Name' and 'last_name' all work. Add a 'class' column to import the whole school in one file."
          action={
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download template
            </Button>
          }
        />
        <div className="p-5">
          <label
            htmlFor="roster-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 focus-within:border-brand-500"
          >
            <Upload className="h-6 w-6 text-slate-400" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-900">
              {fileName ?? 'Choose a spreadsheet'}
            </span>
            <span className="text-xs text-slate-500">CSV, XLSX or XLS up to a few thousand rows</span>
            <input
              id="roster-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(event) => void onFileSelected(event.target.files?.[0])}
            />
          </label>

          {parsing && <p className="mt-3 text-sm text-slate-500">Reading file…</p>}
          {parseError && (
            <div className="mt-3">
              <Alert>{parseError}</Alert>
            </div>
          )}
        </div>
      </Card>

      {parsed && (
        <Card>
          <CardHeader
            title="3. Review and import"
            description={`${readyCount} valid row(s) ready. Rows with problems are listed below and will not be imported.`}
          />

          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{readyCount} ready</Badge>
              {spansClasses && <Badge>{grouping?.groups.length} classes</Badge>}
              {unmatched.length > 0 && <Badge tone="danger">{unmatched.length} unknown class</Badge>}
              {parsed.errors.length > 0 && <Badge tone="danger">{parsed.errors.length} rejected</Badge>}
              {parsed.unmappedHeaders.length > 0 && (
                <Badge tone="warning">{parsed.unmappedHeaders.length} unknown column(s)</Badge>
              )}
            </div>

            {spansClasses && grouping && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">How many students go to each class.</caption>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Class</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-700">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouping.groups.map((group) => (
                      <tr key={group.target.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-900">{group.target.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {group.rows.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
                <ul className="space-y-1 text-sm text-red-800">
                  {unmatched.map((error) => (
                    <li key={`${error.line}-${error.message}`}>
                      <strong>Row {error.line}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.unmappedHeaders.length > 0 && (
              <Alert tone="warning">
                These columns were ignored: {parsed.unmappedHeaders.join(', ')}
              </Alert>
            )}

            {parsed.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
                <ul className="space-y-1 text-sm text-red-800">
                  {parsed.errors.map((error) => (
                    <li key={`${error.line}-${error.message}`}>
                      <strong>Row {error.line}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {readyCount > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Preview of the students that will be imported.</caption>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Admission no.</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Name</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Class</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Gender</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Guardian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map(({ row, className }) => (
                      <tr key={row.admission_number} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-600">{row.admission_number}</td>
                        <td className="px-3 py-2 text-slate-900">
                          {row.last_name} {row.first_name} {row.middle_name ?? ''}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{className}</td>
                        <td className="px-3 py-2 capitalize text-slate-600">{row.gender ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.guardian_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {readyCount > PREVIEW_LIMIT && (
                  <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                    Showing the first {PREVIEW_LIMIT} of {readyCount} rows.
                  </p>
                )}
              </div>
            )}

            {!termId && (
              <Alert tone="warning">
                No current term is configured, so imported students would have no ledger. Set up a term
                first.
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setParsed(null);
                  setFileName(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={pending}
              >
                Clear
              </Button>
              <Button onClick={commit} loading={pending} disabled={!canCommit}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Import {readyCount} student(s)
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
