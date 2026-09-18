import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { toAmount } from '@/lib/format';
import { describeQueryError, type QueryError } from '@/lib/query-error';
import type {
  ClassWithSection,
  FeePayment,
  LedgerRow,
  MatrixRow,
  Profile,
  Section,
  StationeryItem,
  Student,
  Term,
  TermLabel,
} from '@/lib/types/database';

/**
 * Read-side data access.
 *
 * Every function is wrapped in React `cache` so a page that needs the class
 * list in three different components still issues a single query per request.
 */

function fail(context: string, error: QueryError | null): never {
  throw new Error(`${context}: ${describeQueryError(error)}`);
}

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) fail('Failed to load profile', error);
  return data;
});

export const getSections = cache(async (): Promise<Section[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('sections').select('*').order('display_order');
  if (error) fail('Failed to load sections', error);
  return data ?? [];
});

export const getClasses = cache(async (): Promise<ClassWithSection[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .select('*, section:sections(id, name, slug, display_order)')
    .order('promotion_order');
  if (error) fail('Failed to load classes', error);
  return (data ?? []) as unknown as ClassWithSection[];
});

export const getTerms = cache(async (): Promise<(Term & { session: { name: string } })[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('terms')
    .select('*, session:academic_sessions(name)')
    .order('sequence', { ascending: false });
  if (error) fail('Failed to load terms', error);
  return (data ?? []) as unknown as (Term & { session: { name: string } })[];
});

export const getCurrentTerm = cache(async (): Promise<Term | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('terms').select('*').eq('is_current', true).maybeSingle();
  if (error) fail('Failed to load the current term', error);
  return data;
});

/**
 * Resolve the term a page should operate on: an explicit selection when the
 * user made one, otherwise the term the school is currently running.
 */
export async function resolveTerm(termId?: string): Promise<Term | null> {
  if (!termId) return getCurrentTerm();
  const supabase = await createClient();
  const { data, error } = await supabase.from('terms').select('*').eq('id', termId).maybeSingle();
  if (error) fail('Failed to load the selected term', error);
  return data ?? getCurrentTerm();
}

/** The active catalogue. One shared list, offered to every student. */
export const getStationeryItems = cache(async (): Promise<StationeryItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stationery_items')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
    .order('name');
  if (error) fail('Failed to load stationery items', error);
  return data ?? [];
});

export interface CatalogueItem extends StationeryItem {
  /** How many issue records reference this item, across all terms. */
  issuedCount: number;
}

/**
 * The full catalogue, retired items included, with a count of how many times
 * each item has been issued.
 *
 * The counts come from one `in` query over the item ids and are tallied here:
 * PostgREST has no GROUP BY, and a catalogue is a few dozen items at most, so
 * this stays a single round trip either way.
 */
export async function getStationeryCatalogue(): Promise<CatalogueItem[]> {
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from('stationery_items')
    .select('*')
    .order('is_active', { ascending: false })
    .order('display_order')
    .order('name');

  if (error) fail('Failed to load the stationery catalogue', error);
  if (!items || items.length === 0) return [];

  const { data: issues, error: issuesError } = await supabase
    .from('stationery_issues')
    .select('item_id')
    .in(
      'item_id',
      items.map((item) => item.id),
    );

  if (issuesError) fail('Failed to count stationery issues', issuesError);

  const counts = new Map<string, number>();
  for (const issue of issues ?? []) {
    counts.set(issue.item_id, (counts.get(issue.item_id) ?? 0) + 1);
  }

  return items.map((item) => ({ ...item, issuedCount: counts.get(item.id) ?? 0 }));
}

/**
 * The class matrix: one RPC call returns every student in the class with the
 * ids of the items they have already been issued this term.
 */
export async function getClassMatrix(classId: string, termId: string): Promise<MatrixRow[]> {
  const supabase = await createClient();
  // Sent as GET, not POST: the function is STABLE, and only idempotent
  // requests are eligible for the client's transient-failure retries.
  const { data, error } = await supabase.rpc(
    'class_stationery_matrix',
    { p_class_id: classId, p_term_id: termId },
    { get: true },
  );
  if (error) fail('Failed to build the class matrix', error);

  return (data ?? []).map((row) => ({
    studentId: row.student_id,
    admissionNumber: row.admission_number,
    fullName: row.full_name,
    issued: new Map(Object.entries(row.issued ?? {}).map(([itemId, qty]) => [itemId, Number(qty)])),
  }));
}

export interface StudentListFilters {
  classId?: string;
  search?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface StudentListResult {
  students: (Student & { class: { id: string; name: string } })[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listStudents(filters: StudentListFilters = {}): Promise<StudentListResult> {
  const { classId, search, includeArchived = false, page = 1, pageSize = 25 } = filters;
  const supabase = await createClient();

  let query = supabase
    .from('students')
    .select('*, class:classes(id, name)', { count: 'exact' })
    .order('last_name')
    .order('first_name')
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (classId) query = query.eq('class_id', classId);
  if (!includeArchived) query = query.is('archived_at', null);
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},admission_number.ilike.${term},guardian_name.ilike.${term}`,
    );
  }

  const { data, error, count } = await query;
  if (error) fail('Failed to load students', error);

  return {
    students: (data ?? []) as unknown as StudentListResult['students'],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getStudent(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select('*, class:classes(id, name, slug, section_id, section:sections(id, name, slug))')
    .eq('id', studentId)
    .maybeSingle();
  if (error) fail('Failed to load student', error);
  return data as unknown as
    | (Student & {
        class: { id: string; name: string; slug: string; section_id: string; section: Section };
      })
    | null;
}

/**
 * The dual ledger for one class in one term. Students without an account yet
 * still appear, with zeroed figures, so nobody silently drops off the sheet.
 */
export async function getClassLedger(classId: string, termId: string): Promise<LedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select(
      `id, admission_number, first_name, last_name, middle_name,
       class:classes(name), family:families(id, name),
       fee_accounts(id, term_id, arrears, current_bill, total_paid, balance)`,
    )
    .eq('class_id', classId)
    .is('archived_at', null)
    .eq('status', 'active')
    .eq('fee_accounts.term_id', termId)
    .order('last_name')
    .order('first_name');

  if (error) fail('Failed to load the class ledger', error);

  type Raw = {
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    class: { name: string } | null;
    family: { id: string; name: string } | null;
    fee_accounts: {
      id: string;
      arrears: number;
      current_bill: number;
      total_paid: number;
      balance: number;
    }[];
  };

  return ((data ?? []) as unknown as Raw[]).map((row) => {
    const account = row.fee_accounts[0];
    return {
      accountId: account?.id ?? null,
      studentId: row.id,
      admissionNumber: row.admission_number,
      fullName: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '),
      className: row.class?.name ?? '—',
      arrears: toAmount(account?.arrears ?? 0),
      currentBill: toAmount(account?.current_bill ?? 0),
      totalPaid: toAmount(account?.total_paid ?? 0),
      balance: toAmount(account?.balance ?? 0),
      // A pupil in a household is billed there, not here: the class ledger shows
      // who they belong to rather than a misleading zero.
      familyId: row.family?.id ?? null,
      familyName: row.family?.name ?? null,
    };
  });
}

export type PaymentWithTerm = FeePayment & {
  term: { label: TermLabel; session: { name: string } | null } | null;
};

export async function getStudentPayments(studentId: string, limit = 50): Promise<PaymentWithTerm[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fee_payments')
    .select('*, term:terms(label, session:academic_sessions(name))')
    .eq('student_id', studentId)
    .order('paid_at', { ascending: false })
    .limit(limit);
  if (error) fail('Failed to load payment history', error);
  return (data ?? []) as unknown as PaymentWithTerm[];
}

/** Every term this student has a ledger for, newest first. */
export async function getStudentLedgerHistory(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fee_accounts')
    .select('*, term:terms(label, sequence, session:academic_sessions(name)), class:classes(name)')
    .eq('student_id', studentId);
  if (error) fail('Failed to load ledger history', error);

  const rows = (data ?? []) as unknown as {
    id: string;
    arrears: number;
    current_bill: number;
    total_paid: number;
    balance: number;
    term: { label: TermLabel; sequence: number; session: { name: string } | null } | null;
    class: { name: string } | null;
  }[];

  return rows.sort((a, b) => (b.term?.sequence ?? 0) - (a.term?.sequence ?? 0));
}

export async function getRecentPayments(termId: string, limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fee_payments')
    .select('*, student:students(first_name, last_name, admission_number, class:classes(name))')
    .eq('term_id', termId)
    .is('voided_at', null)
    .order('paid_at', { ascending: false })
    .limit(limit);
  if (error) fail('Failed to load recent payments', error);
  return (data ?? []) as unknown as (FeePayment & {
    student: {
      first_name: string;
      last_name: string;
      admission_number: string;
      class: { name: string } | null;
    } | null;
  })[];
}

export async function getFeeStructures(termId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fee_structures')
    .select('*, class:classes(id, name, promotion_order)')
    .eq('term_id', termId);
  if (error) fail('Failed to load fee structures', error);
  return (data ?? []) as unknown as {
    id: string;
    class_id: string;
    term_id: string;
    amount: number;
    description: string | null;
    class: { id: string; name: string; promotion_order: number };
  }[];
}

export interface DashboardStats {
  activeStudents: number;
  expectedRevenue: number;
  collectedRevenue: number;
  outstandingRevenue: number;
  itemsIssued: number;
  studentsFullyCleared: number;
}

export async function getDashboardStats(termId: string): Promise<DashboardStats> {
  const supabase = await createClient();

  // Aggregates are computed over the ledger, which is already one row per
  // student per term — cheap enough to sum in the app for a single term.
  const [studentsResult, accountsResult, issuesResult] = await Promise.all([
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null)
      .eq('status', 'active'),
    supabase.from('fee_accounts').select('arrears, current_bill, total_paid, balance').eq('term_id', termId),
    supabase.from('stationery_issues').select('id', { count: 'exact', head: true }).eq('term_id', termId),
  ]);

  if (studentsResult.error) fail('Failed to count students', studentsResult.error);
  if (accountsResult.error) fail('Failed to summarise fees', accountsResult.error);
  if (issuesResult.error) fail('Failed to count stationery issues', issuesResult.error);

  const accounts = accountsResult.data ?? [];
  const expected = accounts.reduce((sum, a) => sum + toAmount(a.arrears) + toAmount(a.current_bill), 0);
  const collected = accounts.reduce((sum, a) => sum + toAmount(a.total_paid), 0);

  return {
    activeStudents: studentsResult.count ?? 0,
    expectedRevenue: expected,
    collectedRevenue: collected,
    outstandingRevenue: expected - collected,
    itemsIssued: issuesResult.count ?? 0,
    studentsFullyCleared: accounts.filter((a) => toAmount(a.balance) <= 0).length,
  };
}

export async function getPromotionHistory(limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('promotion_batches')
    .select(
      `*, from_class:classes!promotion_batches_from_class_id_fkey(name),
       to_class:classes!promotion_batches_to_class_id_fkey(name)`,
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('Failed to load promotion history', error);
  return (data ?? []) as unknown as {
    id: string;
    student_count: number;
    graduated_count: number;
    rolled_over_total: number;
    created_at: string;
    from_class: { name: string } | null;
    to_class: { name: string } | null;
  }[];
}

// -----------------------------------------------------------------------------
// Families
// -----------------------------------------------------------------------------

export interface FamilySummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  children: number;
  outstanding: number;
}

/** Every household with its combined outstanding, the most owing first. */
export const listFamilies = cache(async function listFamilies(
  search?: string,
): Promise<FamilySummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from('family_balances')
    .select('family_id, name, phone, email, children, outstanding');

  const term = search?.trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);

  const { data, error } = await query.order('outstanding', { ascending: false }).order('name');
  if (error) fail('Failed to load families', error);

  return (data ?? []).map((row) => ({
    id: row.family_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    children: Number(row.children ?? 0),
    outstanding: toAmount(row.outstanding ?? 0),
  }));
});

/**
 * A child of a household. Deliberately carries no figures: the family is what
 * the school bills, so the ledger lives on the household, not here.
 */
export interface FamilyChild {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
}

export interface FamilyDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  children: FamilyChild[];
}

/** A household's own ledger for one term. */
export interface FamilyLedger {
  arrears: number;
  currentBill: number;
  totalPaid: number;
  outstanding: number;
  /** False when no fee has been set for this household this term. */
  hasFee: boolean;
}

/** One household and the children its fee covers. */
export const getFamily = cache(async function getFamily(
  familyId: string,
): Promise<FamilyDetail | null> {
  const supabase = await createClient();

  const { data: family, error: familyError } = await supabase
    .from('families')
    .select('id, name, phone, email, notes')
    .eq('id', familyId)
    .maybeSingle();
  if (familyError) fail('Failed to load the family', familyError);
  if (!family) return null;

  const { data, error } = await supabase
    .from('students')
    .select('id, admission_number, first_name, last_name, middle_name, class:classes(name, promotion_order)')
    .eq('family_id', familyId)
    .is('archived_at', null)
    .eq('status', 'active');
  if (error) fail("Failed to load the family's children", error);

  type Raw = {
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    class: { name: string; promotion_order: number } | null;
  };

  const children = ((data ?? []) as unknown as Raw[])
    // Eldest first, so the list reads the way the parent thinks of their children.
    .sort((a, b) => (b.class?.promotion_order ?? 0) - (a.class?.promotion_order ?? 0))
    .map((row) => ({
      studentId: row.id,
      admissionNumber: row.admission_number,
      fullName: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '),
      className: row.class?.name ?? '—',
    }));

  return {
    id: family.id,
    name: family.name,
    phone: family.phone,
    email: family.email,
    notes: family.notes,
    children,
  };
});

/**
 * What the household was billed and has paid this term.
 *
 * Loaded apart from the family itself so the page can still show the household,
 * its children and its receipts when only this fails — which is what happens
 * when the ledger table has not been migrated in yet.
 */
export const getFamilyLedger = cache(async function getFamilyLedger(
  familyId: string,
  termId: string,
): Promise<FamilyLedger> {
  const supabase = await createClient();

  const { data: account, error } = await supabase
    .from('family_fee_accounts')
    .select('arrears, current_bill, total_paid, balance')
    .eq('family_id', familyId)
    .eq('term_id', termId)
    .maybeSingle();
  if (error) fail("Failed to load the family's ledger", error);

  return {
    arrears: toAmount(account?.arrears ?? 0),
    currentBill: toAmount(account?.current_bill ?? 0),
    totalPaid: toAmount(account?.total_paid ?? 0),
    outstanding: toAmount(account?.balance ?? 0),
    hasFee: Boolean(account),
  };
});

export interface UnassignedStudent {
  id: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  familyId: string | null;
  familyName: string | null;
}

/**
 * Pupils matching a search, for adding to a household. Children already in
 * another family are returned too, labelled — moving one is legitimate, but the
 * bursar should see they are taking them from somewhere.
 */
export async function searchStudentsForFamily(
  search: string,
  limit = 20,
): Promise<UnassignedStudent[]> {
  const term = search.trim();
  if (!term) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select(
      `id, admission_number, first_name, last_name, middle_name, family_id,
       class:classes(name), family:families(name)`,
    )
    .is('archived_at', null)
    .eq('status', 'active')
    .or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_number.ilike.%${term}%`,
    )
    .order('last_name')
    .limit(limit);
  if (error) fail('Failed to search for pupils', error);

  type Raw = {
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    family_id: string | null;
    class: { name: string } | null;
    family: { name: string } | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    admissionNumber: row.admission_number,
    fullName: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '),
    className: row.class?.name ?? '—',
    familyId: row.family_id,
    familyName: row.family?.name ?? null,
  }));
}

/** Past handovers for a household, newest first, with each child's slip. */
export const getFamilyPayments = cache(async function getFamilyPayments(
  familyId: string,
  limit = 20,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('family_payments')
    .select('*, term:terms(label, session:academic_sessions(name))')
    .eq('family_id', familyId)
    .order('paid_at', { ascending: false })
    .limit(limit);
  if (error) fail('Failed to load family payment history', error);
  return data ?? [];
});
