-- =============================================================================
-- Families: paying for siblings together
-- =============================================================================
-- A family groups the pupils of one household behind a single guardian. Fees
-- stay per student — the ledger, the arrears roll-forward and the promotion
-- engine are all keyed on a pupil, and a household's children sit in different
-- classes on different fee structures. What a family adds is a way to see one
-- combined outstanding figure and to settle it in a single transaction that
-- still writes one payment row per child.
--
-- Safe to re-run.
-- =============================================================================

-- Households ------------------------------------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  -- Whoever the school deals with: "Alhaji Musa Ibrahim", "The Eze family".
  name text not null check (btrim(name) <> ''),
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Names repeat across unrelated households, so the index only speeds up search.
create index if not exists families_name_idx on public.families (lower(btrim(name)));
create index if not exists families_phone_idx on public.families (phone) where phone is not null;

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

-- A pupil belongs to at most one household. Deleting the household leaves the
-- pupil in place, unassigned — never cascade a child out of the roster.
alter table public.students
  add column if not exists family_id uuid references public.families (id) on delete set null;

create index if not exists students_family_idx on public.students (family_id)
  where family_id is not null and archived_at is null;

-- Grouped payments ------------------------------------------------------------
create sequence if not exists public.family_receipt_number_seq start 1;

create table if not exists public.family_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  receipt_number text not null unique,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  method public.payment_method not null default 'cash',
  reference text,
  notes text,
  -- The household's combined position at the moment of payment, so a reprinted
  -- family receipt shows what the parent was actually told. Mirrors the same
  -- decision on fee_payments.
  balance_before numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_payments_family_idx
  on public.family_payments (family_id, paid_at desc);
create index if not exists family_payments_term_idx
  on public.family_payments (term_id, paid_at desc);

drop trigger if exists family_payments_set_updated_at on public.family_payments;
create trigger family_payments_set_updated_at
  before update on public.family_payments
  for each row execute function public.set_updated_at();

-- Each child's payment still stands on its own; this only records that several
-- were taken in one handover, so the slips can be reprinted as one receipt.
alter table public.fee_payments
  add column if not exists family_payment_id uuid
    references public.family_payments (id) on delete set null;

create index if not exists fee_payments_family_payment_idx
  on public.fee_payments (family_payment_id) where family_payment_id is not null;

-- What each household owes right now ------------------------------------------
-- Only the current term: arrears from earlier terms are already rolled into
-- fee_accounts.arrears by the promotion engine, so this is the whole debt.
-- The unqualified join to terms is safe because terms_single_current_idx allows
-- at most one row where is_current.
create or replace view public.family_balances
with (security_invoker = true) as
select
  f.id            as family_id,
  f.name,
  f.phone,
  f.email,
  count(s.id) filter (where s.id is not null)              as children,
  coalesce(sum(fa.balance), 0)::numeric(12, 2)             as outstanding,
  coalesce(sum(fa.arrears + fa.current_bill), 0)::numeric(12, 2) as billed,
  coalesce(sum(fa.total_paid), 0)::numeric(12, 2)          as paid
from public.families f
left join public.students s
  on s.family_id = f.id and s.archived_at is null and s.status = 'active'
left join public.terms t
  on t.is_current
left join public.fee_accounts fa
  on fa.student_id = s.id and fa.term_id = t.id
group by f.id, f.name, f.phone, f.email;

-- -----------------------------------------------------------------------------
-- Record one payment across several children in a single transaction.
--
-- p_allocations is [{ "student_id": uuid, "amount": numeric }, ...]. Children
-- receiving nothing may be left out or sent as zero. Every amount is checked
-- against that child's own balance before anything is written, so a slip of the
-- finger cannot overpay one child and the whole handover fails as a unit.
-- -----------------------------------------------------------------------------
create or replace function public.record_family_payment(
  p_family_id uuid,
  p_term_id uuid,
  p_allocations jsonb,
  p_method public.payment_method default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default now()
)
returns public.family_payments
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_family public.families;
  v_group public.family_payments;
  v_total numeric(12, 2) := 0;
  v_before numeric(12, 2) := 0;
  v_receipt text;
  v_row record;
  v_account public.fee_accounts;
  v_child_receipt text;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'record payments');

  select * into v_family from public.families where id = p_family_id;
  if v_family.id is null then
    raise exception 'Family not found' using errcode = 'no_data_found';
  end if;

  -- Serialise concurrent handovers for the same household. An advisory lock
  -- rather than SELECT ... FOR UPDATE: row locks on students would additionally
  -- demand an UPDATE policy, which bursars do not have.
  perform pg_advisory_xact_lock(hashtext('family_payment:' || p_family_id::text));

  -- The household's combined position before anything is applied.
  select coalesce(sum(fa.balance), 0) into v_before
    from public.students s
    join public.fee_accounts fa on fa.student_id = s.id and fa.term_id = p_term_id
   where s.family_id = p_family_id and s.archived_at is null and s.status = 'active';

  -- Validate every line first: nothing is written until all of them pass.
  for v_row in
    select
      (entry ->> 'student_id')::uuid as student_id,
      round(coalesce((entry ->> 'amount')::numeric, 0), 2) as amount
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) as entry
  loop
    if v_row.amount < 0 then
      raise exception 'A payment amount cannot be negative'
        using errcode = 'check_violation';
    end if;

    continue when v_row.amount = 0;

    select fa.* into v_account
      from public.fee_accounts fa
      join public.students s on s.id = fa.student_id
     where fa.student_id = v_row.student_id
       and fa.term_id = p_term_id
       and s.family_id = p_family_id
       and s.archived_at is null;

    if v_account.id is null then
      raise exception 'One of the pupils is not in this family, or has no fee account this term'
        using errcode = 'no_data_found';
    end if;

    if v_row.amount > v_account.balance then
      raise exception 'Paying % for one pupil exceeds their outstanding balance of %',
        v_row.amount, v_account.balance
        using errcode = 'check_violation';
    end if;

    v_total := v_total + v_row.amount;
  end loop;

  if v_total <= 0 then
    raise exception 'Enter an amount for at least one pupil'
      using errcode = 'check_violation';
  end if;

  v_receipt := 'FAM-' || to_char(nextval('public.family_receipt_number_seq'), 'FM000000');

  insert into public.family_payments (
    family_id, term_id, receipt_number, total_amount, method, reference, notes,
    balance_before, balance_after, paid_at, recorded_by
  )
  values (
    p_family_id, p_term_id, v_receipt, v_total, p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_before, v_before - v_total, coalesce(p_paid_at, now()), auth.uid()
  )
  returning * into v_group;

  -- Apply each line. Re-read the account inside the loop so the snapshot on the
  -- child's own receipt reflects the ledger as this transaction leaves it.
  for v_row in
    select
      (entry ->> 'student_id')::uuid as student_id,
      round(coalesce((entry ->> 'amount')::numeric, 0), 2) as amount
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) as entry
  loop
    continue when v_row.amount = 0;

    select * into v_account
      from public.fee_accounts
     where student_id = v_row.student_id and term_id = p_term_id;

    v_child_receipt := 'RCP-' || to_char(nextval('public.receipt_number_seq'), 'FM000000');

    update public.fee_accounts
       set total_paid = total_paid + v_row.amount
     where id = v_account.id;

    insert into public.fee_payments (
      account_id, student_id, term_id, receipt_number, amount, method,
      reference, notes, balance_before, balance_after, paid_at, recorded_by,
      family_payment_id
    )
    values (
      v_account.id, v_row.student_id, p_term_id, v_child_receipt, v_row.amount, p_method,
      nullif(btrim(coalesce(p_reference, '')), ''),
      nullif(btrim(coalesce(p_notes, '')), ''),
      v_account.balance, v_account.balance - v_row.amount,
      coalesce(p_paid_at, now()), auth.uid(),
      v_group.id
    );
  end loop;

  return v_group;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Assign pupils to a household (or, with a null family, unassign them).
-- -----------------------------------------------------------------------------
create or replace function public.set_student_family(
  p_family_id uuid,
  p_student_ids uuid[]
)
returns integer
language plpgsql
-- SECURITY DEFINER so a bursar can group pupils without being handed UPDATE on
-- the whole students table. The function only ever writes family_id, and the
-- caller's role is checked on the way in.
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'group pupils into families');

  if p_family_id is not null and not exists (select 1 from public.families where id = p_family_id) then
    raise exception 'Family not found' using errcode = 'no_data_found';
  end if;

  update public.students
     set family_id = p_family_id
   where id = any(coalesce(p_student_ids, array[]::uuid[]))
     and archived_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- Row Level Security -----------------------------------------------------------
alter table public.families         enable row level security;
alter table public.family_payments  enable row level security;

drop policy if exists "staff read families" on public.families;
create policy "staff read families"
  on public.families for select to authenticated using (true);

drop policy if exists "finance staff manage families" on public.families;
create policy "finance staff manage families"
  on public.families for all to authenticated
  using (public.has_role(array['admin', 'bursar']::public.app_role[]))
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

drop policy if exists "staff read family payments" on public.family_payments;
create policy "staff read family payments"
  on public.family_payments for select to authenticated using (true);

drop policy if exists "finance staff record family payments" on public.family_payments;
create policy "finance staff record family payments"
  on public.family_payments for insert to authenticated
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

revoke all on function public.record_family_payment(uuid, uuid, jsonb, public.payment_method, text, text, timestamptz) from public;
revoke all on function public.set_student_family(uuid, uuid[]) from public;
grant execute on function public.record_family_payment(uuid, uuid, jsonb, public.payment_method, text, text, timestamptz) to authenticated;
grant execute on function public.set_student_family(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
