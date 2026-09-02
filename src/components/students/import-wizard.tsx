'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/field';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  importTemplateCsv,
  parseRosterFile,
  type ImportRow,
  type ParseResult,
} from '@/lib/roster/import';
import { errorMessage } from '@/lib/utils';
import { bulkImportStudents } from '@/server/actions/students';

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

  function commit() {
    if (!parsed || !termId || !classId) return;

    startTransition(async () => {
      const result = await bulkImportStudents({ classId, termId, rows: parsed.rows as ImportRow[] });
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }

      const { imported, skipped } = result.data;
      toast(
        skipped > 0
          ? `${imported} student(s) imported, ${skipped} skipped as duplicates`
          : `${imported} student(s) imported`,
        'success',
      );
      router.push(`/students?class=${classId}`);
      router.refresh();
    });
  }

  const canCommit = Boolean(parsed && parsed.rows.length > 0 && classId && termId && !pending);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="1. Choose the destination class" description="Every row in the file is imported into this class." />
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
          description="CSV, XLSX or XLS. Column names are matched flexibly — 'Surname', 'Last Name' and 'last_name' all work."
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
            description={`${parsed.rows.length} valid row(s) ready. Rows with problems are listed below and will not be imported.`}
          />

          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{parsed.rows.length} ready</Badge>
              {parsed.errors.length > 0 && <Badge tone="danger">{parsed.errors.length} rejected</Badge>}
              {parsed.unmappedHeaders.length > 0 && (
                <Badge tone="warning">{parsed.unmappedHeaders.length} unknown column(s)</Badge>
              )}
            </div>

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

            {parsed.rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Preview of the students that will be imported.</caption>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Admission no.</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Name</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Gender</th>
                      <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Guardian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, PREVIEW_LIMIT).map((row) => (
                      <tr key={row.admission_number} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-600">{row.admission_number}</td>
                        <td className="px-3 py-2 text-slate-900">
                          {row.last_name} {row.first_name} {row.middle_name ?? ''}
                        </td>
                        <td className="px-3 py-2 capitalize text-slate-600">{row.gender ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.guardian_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > PREVIEW_LIMIT && (
                  <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                    Showing the first {PREVIEW_LIMIT} of {parsed.rows.length} rows.
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
                Import {parsed.rows.length} student(s)
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
