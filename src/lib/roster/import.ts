import Papa from 'papaparse';
import { z } from 'zod';

/**
 * Spreadsheet import for the roster engine.
 *
 * Parsing happens in the browser so the clerk sees validation feedback before
 * anything is sent; the server re-validates the same shape before it writes.
 */

export const importRowSchema = z.object({
  admission_number: z.string().trim().min(1, 'Admission number is required').max(50),
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  last_name: z.string().trim().min(1, 'Last name is required').max(80),
  middle_name: z.string().trim().max(80).optional().nullable(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  date_of_birth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .optional()
    .nullable(),
  guardian_name: z.string().trim().max(120).optional().nullable(),
  guardian_phone: z.string().trim().max(40).optional().nullable(),
  guardian_email: z.string().trim().email('Invalid guardian email').optional().nullable(),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export interface RowError {
  /** 1-based row number as it appears in the user's spreadsheet, header included. */
  line: number;
  message: string;
}

export interface ParseResult {
  rows: ImportRow[];
  errors: RowError[];
  /** Header names we could not map, surfaced so the user can fix their file. */
  unmappedHeaders: string[];
}

/** Every accepted spelling of a column, normalised to our field names. */
const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  admissionnumber: 'admission_number',
  admissionno: 'admission_number',
  admno: 'admission_number',
  regno: 'admission_number',
  registrationnumber: 'admission_number',
  studentid: 'admission_number',
  firstname: 'first_name',
  givenname: 'first_name',
  lastname: 'last_name',
  surname: 'last_name',
  familyname: 'last_name',
  middlename: 'middle_name',
  othernames: 'middle_name',
  othername: 'middle_name',
  gender: 'gender',
  sex: 'gender',
  dateofbirth: 'date_of_birth',
  dob: 'date_of_birth',
  birthdate: 'date_of_birth',
  guardianname: 'guardian_name',
  parentname: 'guardian_name',
  guardian: 'guardian_name',
  guardianphone: 'guardian_phone',
  parentphone: 'guardian_phone',
  phone: 'guardian_phone',
  phonenumber: 'guardian_phone',
  guardianemail: 'guardian_email',
  parentemail: 'guardian_email',
  email: 'guardian_email',
};

export const IMPORT_TEMPLATE_HEADERS = [
  'admission_number',
  'first_name',
  'last_name',
  'middle_name',
  'gender',
  'date_of_birth',
  'guardian_name',
  'guardian_phone',
  'guardian_email',
] as const;

function normaliseHeader(header: string): keyof ImportRow | null {
  const key = header.toLowerCase().replace(/[^a-z]/g, '');
  return HEADER_ALIASES[key] ?? null;
}

function normaliseGender(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (['m', 'male', 'boy'].includes(key)) return 'male';
  if (['f', 'female', 'girl'].includes(key)) return 'female';
  return null;
}

/**
 * Excel serial dates, `12/05/2016`, and ISO strings all end up as `YYYY-MM-DD`.
 * Ambiguous day/month order resolves to day-first, matching Nigerian convention.
 */
function normaliseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const serial = Number(trimmed);
  if (Number.isInteger(serial) && serial > 0 && serial < 60000) {
    // Excel's epoch is 1899-12-30 once its leap-year bug is accounted for.
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  const slashed = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slashed) {
    const [, day, month, year] = slashed;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Turn raw header/value records into validated rows plus per-line errors. */
export function normaliseRecords(records: Record<string, unknown>[]): ParseResult {
  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  const unmapped = new Set<string>();
  const seenAdmissionNumbers = new Set<string>();

  records.forEach((record, index) => {
    // +2: spreadsheets are 1-based and the first row is the header.
    const line = index + 2;
    const mapped: Record<string, string | null> = {};

    for (const [header, rawValue] of Object.entries(record)) {
      const field = normaliseHeader(header);
      if (!field) {
        if (cleanCell(header)) unmapped.add(header);
        continue;
      }

      const value = cleanCell(rawValue);
      if (!value) {
        mapped[field] = null;
        continue;
      }

      if (field === 'gender') mapped[field] = normaliseGender(value);
      else if (field === 'date_of_birth') mapped[field] = normaliseDate(value);
      else mapped[field] = value;
    }

    // Skip blank spacer rows rather than reporting them as errors.
    if (Object.values(mapped).every((value) => !value)) return;

    const parsed = importRowSchema.safeParse(mapped);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      errors.push({ line, message: issue?.message ?? 'Invalid row' });
      return;
    }

    const admissionNumber = parsed.data.admission_number;
    if (seenAdmissionNumbers.has(admissionNumber)) {
      errors.push({ line, message: `Duplicate admission number ${admissionNumber} in this file` });
      return;
    }

    seenAdmissionNumbers.add(admissionNumber);
    rows.push(parsed.data);
  });

  return { rows, errors, unmappedHeaders: [...unmapped] };
}

async function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  return result.data;
}

async function parseExcel(file: File): Promise<Record<string, unknown>[]> {
  // Loaded on demand: the workbook parser is large and most imports are CSV.
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
}

/** Parse a `.csv`, `.xlsx` or `.xls` roster file into validated rows. */
export async function parseRosterFile(file: File): Promise<ParseResult> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  const records = isExcel ? await parseExcel(file) : await parseCsv(file);
  return normaliseRecords(records);
}

/** A ready-to-fill CSV the user can download from the import screen. */
export function importTemplateCsv(): string {
  const sample = [
    'BFS/2026/001,Grace,Adeyemi,Ifeoluwa,female,2016-05-12,Mr Tunde Adeyemi,08031234567,tunde@example.com',
    'BFS/2026/002,Musa,Ibrahim,,male,2015-11-03,Mrs Aisha Ibrahim,08129876543,',
  ];
  return [IMPORT_TEMPLATE_HEADERS.join(','), ...sample].join('\n');
}
