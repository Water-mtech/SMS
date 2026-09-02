-- =============================================================================
-- School Stationery & Fee Management System — core schema
-- =============================================================================
-- Conventions:
--   * Money is stored as numeric(12,2). Never float.
--   * Every mutable table carries created_at / updated_at maintained by trigger.
--   * Soft deletion is expressed via students.archived_at (never hard-delete a
--     student: their fee ledger and receipts must remain auditable).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
create type public.student_status as enum ('active', 'graduated', 'transferred', 'withdrawn');
create type public.gender as enum ('male', 'female');
create type public.payment_method as enum ('cash', 'bank_transfer', 'pos', 'cheque', 'online');
create type public.term_label as enum ('first', 'second', 'third');
create type public.app_role as enum ('admin', 'bursar', 'teacher');

-- -----------------------------------------------------------------------------
-- Staff / access control
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'teacher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Convenience predicate used across RLS policies.
create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = any (roles)
  );
$$;

-- -----------------------------------------------------------------------------
-- Academic structure: sections -> classes
-- -----------------------------------------------------------------------------
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  display_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_display_order_key unique (display_order)
);

create trigger sections_set_updated_at
  before update on public.sections
  for each row execute function public.set_updated_at();

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete restrict,
  name text not null unique,
  slug text not null unique,
  -- Drives the promotion engine: a student in promotion_order N moves to N + 1.
  promotion_order smallint not null unique,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index classes_section_id_idx on public.classes (section_id);

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Academic calendar: sessions -> terms
-- -----------------------------------------------------------------------------
create table public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,               -- e.g. '2025/2026'
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_sessions_date_order check (ends_on > starts_on)
);

create trigger academic_sessions_set_updated_at
  before update on public.academic_sessions
  for each row execute function public.set_updated_at();

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academic_sessions (id) on delete cascade,
  label public.term_label not null,
  -- Monotonically increasing across sessions so "the next term" is well defined.
  sequence integer not null unique,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_session_label_key unique (session_id, label),
  constraint terms_date_order check (ends_on > starts_on)
);

create index terms_session_id_idx on public.terms (session_id);

-- Exactly one current term at a time.
create unique index terms_single_current_idx on public.terms (is_current) where is_current;

create trigger terms_set_updated_at
  before update on public.terms
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Students
-- -----------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  admission_number text not null unique,
  first_name text not null,
  last_name text not null,
  middle_name text,
  gender public.gender,
  date_of_birth date,
  class_id uuid not null references public.classes (id) on delete restrict,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  status public.student_status not null default 'active',
  admitted_on date not null default current_date,
  -- Soft deletion. Archived students disappear from rosters but keep their ledger.
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_names_not_blank check (
    length(btrim(first_name)) > 0 and length(btrim(last_name)) > 0
  )
);

create index students_class_id_idx on public.students (class_id) where archived_at is null;
create index students_status_idx on public.students (status) where archived_at is null;
create index students_name_idx on public.students (last_name, first_name);

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

-- Full name is needed on nearly every screen; compute it once in the database.
create or replace function public.student_full_name(s public.students)
returns text
language sql
immutable
as $$
  select btrim(s.last_name || ' ' || s.first_name || coalesce(' ' || s.middle_name, ''));
$$;

-- -----------------------------------------------------------------------------
-- Stationery
-- -----------------------------------------------------------------------------
create table public.stationery_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  name text not null,
  description text,
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  display_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stationery_items_section_name_key unique (section_id, name),
  constraint stationery_items_name_not_blank check (length(btrim(name)) > 0)
);

create index stationery_items_section_idx on public.stationery_items (section_id, display_order);

create trigger stationery_items_set_updated_at
  before update on public.stationery_items
  for each row execute function public.set_updated_at();

-- A row here means "this student has received this item this term".
create table public.stationery_issues (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  item_id uuid not null references public.stationery_items (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  quantity smallint not null default 1 check (quantity > 0),
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stationery_issues_unique unique (student_id, item_id, term_id)
);

create index stationery_issues_term_student_idx on public.stationery_issues (term_id, student_id);
create index stationery_issues_item_idx on public.stationery_issues (item_id);

create trigger stationery_issues_set_updated_at
  before update on public.stationery_issues
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Fees: structures, dual ledger, payments
-- -----------------------------------------------------------------------------
create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_structures_class_term_key unique (class_id, term_id)
);

create index fee_structures_term_idx on public.fee_structures (term_id);

create trigger fee_structures_set_updated_at
  before update on public.fee_structures
  for each row execute function public.set_updated_at();

-- The dual ledger. One row per student per term:
--   arrears       -> everything carried over from previous terms
--   current_bill  -> what this term itself costs
--   total_paid    -> sum of non-voided payments against this account
--   balance       -> derived, never written by hand
create table public.fee_accounts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete restrict,
  arrears numeric(12, 2) not null default 0 check (arrears >= 0),
  current_bill numeric(12, 2) not null default 0 check (current_bill >= 0),
  total_paid numeric(12, 2) not null default 0 check (total_paid >= 0),
  balance numeric(12, 2) generated always as (arrears + current_bill - total_paid) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_accounts_student_term_key unique (student_id, term_id),
  constraint fee_accounts_not_overpaid check (total_paid <= arrears + current_bill)
);

create index fee_accounts_term_class_idx on public.fee_accounts (term_id, class_id);
create index fee_accounts_student_idx on public.fee_accounts (student_id);
create index fee_accounts_outstanding_idx on public.fee_accounts (term_id) where balance > 0;

create trigger fee_accounts_set_updated_at
  before update on public.fee_accounts
  for each row execute function public.set_updated_at();

-- Human-facing receipt numbers: RCP-000001, RCP-000002, ...
create sequence public.receipt_number_seq start 1;

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.fee_accounts (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  receipt_number text not null unique,
  amount numeric(12, 2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  reference text,
  notes text,
  -- Snapshot of the ledger at the moment of payment, so a reprinted receipt
  -- always shows what the payer actually saw.
  balance_before numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fee_payments_account_idx on public.fee_payments (account_id, paid_at desc);
create index fee_payments_student_idx on public.fee_payments (student_id, paid_at desc);
create index fee_payments_term_idx on public.fee_payments (term_id, paid_at desc);

create trigger fee_payments_set_updated_at
  before update on public.fee_payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Promotion audit trail
-- -----------------------------------------------------------------------------
create table public.promotion_batches (
  id uuid primary key default gen_random_uuid(),
  from_class_id uuid not null references public.classes (id) on delete restrict,
  to_class_id uuid references public.classes (id) on delete restrict,
  from_term_id uuid not null references public.terms (id) on delete restrict,
  to_term_id uuid not null references public.terms (id) on delete restrict,
  student_count integer not null default 0,
  graduated_count integer not null default 0,
  rolled_over_total numeric(12, 2) not null default 0,
  performed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.promotion_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.promotion_batches (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  from_class_id uuid not null references public.classes (id) on delete restrict,
  to_class_id uuid references public.classes (id) on delete restrict,
  rolled_over_balance numeric(12, 2) not null default 0,
  graduated boolean not null default false,
  created_at timestamptz not null default now(),
  constraint promotion_records_batch_student_key unique (batch_id, student_id)
);

create index promotion_records_student_idx on public.promotion_records (student_id);
