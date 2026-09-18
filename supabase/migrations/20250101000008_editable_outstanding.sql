-- =============================================================================
-- Outstanding becomes a figure the school owns
-- =============================================================================
-- Until now a balance was arithmetic the database insisted on: arrears plus
-- this term's bill, less whatever had been paid, with a constraint forbidding
-- anyone from paying more than they were billed.
--
-- That does not survive contact with the school. There are charges outside the
-- school fee, so a parent legitimately hands over more than the bill, and the
-- true figure they still owe is something the bursar knows and the system does
-- not. So:
--
--   * a payment is recorded at the amount actually received, never capped;
--   * the outstanding figure is set directly, and only reaches zero when
--     somebody says it has;
--   * the per-class fee structure stays, as a default to apply in bulk and then
--     override wherever a pupil or a household differs.
--
-- A family now carries one fee and one outstanding of its own, rather than the
-- sum of its children: the household is what the school bills and what the
-- parent pays. Children of a family keep no separate figure — their ledger is
-- the family's.
--
-- Safe to re-run.
-- =============================================================================

-- 1. Let a payment exceed the bill ---------------------------------------------
alter table public.fee_accounts drop constraint if exists fee_accounts_not_overpaid;

-- 2. Turn `balance` from a generated column into one that can be set -----------
-- Done in place so no figure is lost: the derived value is copied aside, the
-- generated column dropped, and the copy renamed back into its place.
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'fee_accounts'
       and column_name = 'balance' and is_generated = 'ALWAYS'
  ) then
    alter table public.fee_accounts add column balance_settable numeric(12, 2);
    update public.fee_accounts set balance_settable = balance;

    drop view if exists public.family_balances;
    drop index if exists public.fee_accounts_outstanding_idx;
    alter table public.fee_accounts drop column balance;

    alter table public.fee_accounts rename column balance_settable to balance;
    alter table public.fee_accounts alter column balance set default 0;
    update public.fee_accounts set balance = 0 where balance is null;
    alter table public.fee_accounts alter column balance set not null;
  end if;
end
$mig$;

-- An outstanding figure is never negative: paying more than was owed clears the
-- account, it does not put the school in debt to the parent.
alter table public.fee_accounts drop constraint if exists fee_accounts_balance_not_negative;
alter table public.fee_accounts
  add constraint fee_accounts_balance_not_negative check (balance >= 0);

create index if not exists fee_accounts_outstanding_idx
  on public.fee_accounts (term_id) where balance > 0;

-- 3. A household's own ledger ---------------------------------------------------
create table if not exists public.family_fee_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  -- What the household was billed, split the same way a pupil's is so the two
  -- ledgers read alike.
  arrears numeric(12, 2) not null default 0 check (arrears >= 0),
  current_bill numeric(12, 2) not null default 0 check (current_bill >= 0),
  total_paid numeric(12, 2) not null default 0 check (total_paid >= 0),
  -- Set directly, not derived. This is the number the parent is told.
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_fee_accounts_family_term_key unique (family_id, term_id)
);

create index if not exists family_fee_accounts_term_idx
  on public.family_fee_accounts (term_id) where balance > 0;

drop trigger if exists family_fee_accounts_set_updated_at on public.family_fee_accounts;
create trigger family_fee_accounts_set_updated_at
  before update on public.family_fee_accounts
  for each row execute function public.set_updated_at();

alter table public.family_payments
  add column if not exists account_id uuid
    references public.family_fee_accounts (id) on delete set null;

-- 4. What each household owes ---------------------------------------------------
-- Now read from the household's own ledger rather than summed from its children.
create or replace view public.family_balances
with (security_invoker = true) as
select
  f.id      as family_id,
  f.name,
  f.phone,
  f.email,
  (select count(*)
     from public.students s
    where s.family_id = f.id and s.archived_at is null and s.status = 'active') as children,
  coalesce(fa.balance, 0)::numeric(12, 2)                        as outstanding,
  coalesce(fa.arrears + fa.current_bill, 0)::numeric(12, 2)      as billed,
  coalesce(fa.total_paid, 0)::numeric(12, 2)                     as paid,
  fa.id                                                          as account_id
from public.families f
left join public.terms t on t.is_current
left join public.family_fee_accounts fa on fa.family_id = f.id and fa.term_id = t.id;

-- 5. Setting a fee by hand -------------------------------------------------------
-- p_balance null means "recalculate from the figures" — billed less paid, floored
-- at zero. Passing a number sets the outstanding outright, which is how a charge
-- outside the school fee gets onto the ledger.
create or replace function public.set_student_fee(
  p_student_id uuid,
  p_term_id uuid,
  p_arrears numeric,
  p_current_bill numeric,
  p_balance numeric default null
)
returns public.fee_accounts
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_account public.fee_accounts;
  v_class_id uuid;
  v_arrears numeric(12, 2) := round(greatest(coalesce(p_arrears, 0), 0), 2);
  v_bill numeric(12, 2) := round(greatest(coalesce(p_current_bill, 0), 0), 2);
  v_paid numeric(12, 2);
  v_balance numeric(12, 2);
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'set fees');

  select class_id into v_class_id
    from public.students where id = p_student_id and archived_at is null;
  if v_class_id is null then
    raise exception 'Student not found' using errcode = 'no_data_found';
  end if;

  select total_paid into v_paid
    from public.fee_accounts where student_id = p_student_id and term_id = p_term_id;
  v_paid := coalesce(v_paid, 0);

  v_balance := round(greatest(coalesce(p_balance, v_arrears + v_bill - v_paid), 0), 2);

  insert into public.fee_accounts (
    student_id, term_id, class_id, arrears, current_bill, total_paid, balance
  )
  values (p_student_id, p_term_id, v_class_id, v_arrears, v_bill, v_paid, v_balance)
  on conflict (student_id, term_id) do update
    set arrears = excluded.arrears,
        current_bill = excluded.current_bill,
        balance = excluded.balance,
        class_id = excluded.class_id
  returning * into v_account;

  return v_account;
end;
$fn$;

create or replace function public.set_family_fee(
  p_family_id uuid,
  p_term_id uuid,
  p_arrears numeric,
  p_current_bill numeric,
  p_balance numeric default null
)
returns public.family_fee_accounts
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_account public.family_fee_accounts;
  v_arrears numeric(12, 2) := round(greatest(coalesce(p_arrears, 0), 0), 2);
  v_bill numeric(12, 2) := round(greatest(coalesce(p_current_bill, 0), 0), 2);
  v_paid numeric(12, 2);
  v_balance numeric(12, 2);
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'set fees');

  if not exists (select 1 from public.families where id = p_family_id) then
    raise exception 'Family not found' using errcode = 'no_data_found';
  end if;

  select total_paid into v_paid
    from public.family_fee_accounts where family_id = p_family_id and term_id = p_term_id;
  v_paid := coalesce(v_paid, 0);

  v_balance := round(greatest(coalesce(p_balance, v_arrears + v_bill - v_paid), 0), 2);

  insert into public.family_fee_accounts (
    family_id, term_id, arrears, current_bill, total_paid, balance
  )
  values (p_family_id, p_term_id, v_arrears, v_bill, v_paid, v_balance)
  on conflict (family_id, term_id) do update
    set arrears = excluded.arrears,
        current_bill = excluded.current_bill,
        balance = excluded.balance
  returning * into v_account;

  return v_account;
end;
$fn$;

-- 6. Payments ---------------------------------------------------------------------
-- The amount received is written as given. p_outstanding_after null leaves the
-- ledger to subtract it; a number sets what the parent still owes, which is how
-- an overpayment against charges the system never saw is settled honestly.
-- The extra parameter makes a new signature, so the old one must go explicitly
-- or PostgREST is left with two candidates and refuses to call either.
drop function if exists public.record_fee_payment(uuid, uuid, numeric, public.payment_method, text, text, timestamptz);

create or replace function public.record_fee_payment(
  p_student_id uuid,
  p_term_id uuid,
  p_amount numeric,
  p_method public.payment_method default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default now(),
  p_outstanding_after numeric default null
)
returns public.fee_payments
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_account public.fee_accounts;
  v_payment public.fee_payments;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_receipt text;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'record payments');

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero'
      using errcode = 'check_violation';
  end if;

  select * into v_account
    from public.fee_accounts
   where student_id = p_student_id and term_id = p_term_id
   for update;

  if v_account.id is null then
    raise exception 'This student has no fee account for the selected term'
      using errcode = 'no_data_found';
  end if;

  v_before := v_account.balance;
  v_after := round(greatest(coalesce(p_outstanding_after, v_before - p_amount), 0), 2);

  v_receipt := 'RCP-' || to_char(nextval('public.receipt_number_seq'), 'FM000000');

  update public.fee_accounts
     set total_paid = total_paid + p_amount,
         balance = v_after
   where id = v_account.id;

  insert into public.fee_payments (
    account_id, student_id, term_id, receipt_number, amount, method,
    reference, notes, balance_before, balance_after, paid_at, recorded_by
  )
  values (
    v_account.id, p_student_id, p_term_id, v_receipt, round(p_amount, 2), p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_before, v_after, coalesce(p_paid_at, now()), auth.uid()
  )
  returning * into v_payment;

  return v_payment;
end;
$fn$;

-- One payment for a household. No per-child split: the family is what is billed,
-- so the money lands on the family's own ledger and the receipt says so.
drop function if exists public.record_family_payment(uuid, uuid, jsonb, public.payment_method, text, text, timestamptz);

create or replace function public.record_family_payment(
  p_family_id uuid,
  p_term_id uuid,
  p_amount numeric,
  p_method public.payment_method default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default now(),
  p_outstanding_after numeric default null
)
returns public.family_payments
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_account public.family_fee_accounts;
  v_group public.family_payments;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_receipt text;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'record payments');

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero'
      using errcode = 'check_violation';
  end if;

  select * into v_account
    from public.family_fee_accounts
   where family_id = p_family_id and term_id = p_term_id
   for update;

  if v_account.id is null then
    raise exception 'This family has no fee set for the selected term'
      using errcode = 'no_data_found';
  end if;

  v_before := v_account.balance;
  v_after := round(greatest(coalesce(p_outstanding_after, v_before - p_amount), 0), 2);

  v_receipt := 'FAM-' || to_char(nextval('public.family_receipt_number_seq'), 'FM000000');

  update public.family_fee_accounts
     set total_paid = total_paid + p_amount,
         balance = v_after
   where id = v_account.id;

  insert into public.family_payments (
    family_id, term_id, account_id, receipt_number, total_amount, method,
    reference, notes, balance_before, balance_after, paid_at, recorded_by
  )
  values (
    p_family_id, p_term_id, v_account.id, v_receipt, round(p_amount, 2), p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_before, v_after, coalesce(p_paid_at, now()), auth.uid()
  )
  returning * into v_group;

  return v_group;
end;
$fn$;

-- 7. Voiding must put back what it took ------------------------------------------
create or replace function public.void_fee_payment(
  p_payment_id uuid,
  p_reason text default null
)
returns public.fee_payments
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_payment public.fee_payments;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'void payments');

  select * into v_payment from public.fee_payments where id = p_payment_id for update;

  if v_payment.id is null then
    raise exception 'Payment not found' using errcode = 'no_data_found';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'This payment has already been voided' using errcode = 'check_violation';
  end if;

  -- Restore the outstanding figure this payment was applied against, so voiding
  -- undoes the whole effect rather than only the money.
  update public.fee_accounts
     set total_paid = greatest(total_paid - v_payment.amount, 0),
         balance = v_payment.balance_before
   where id = v_payment.account_id;

  update public.fee_payments
     set voided_at = now(),
         voided_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$fn$;

-- 8. Applying a class structure must not overwrite a hand-set figure -------------
create or replace function public.sync_class_fee_bills(
  p_class_id uuid,
  p_term_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_amount numeric(12, 2);
  v_count integer;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'apply fee structures');

  select amount into v_amount
    from public.fee_structures where class_id = p_class_id and term_id = p_term_id;

  if v_amount is null then
    raise exception 'No fee structure is set for this class and term'
      using errcode = 'no_data_found';
  end if;

  -- Pupils billed through a household are skipped: the family carries the fee.
  insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill, balance)
  select s.id, p_term_id, p_class_id, 0, v_amount, v_amount
    from public.students s
   where s.class_id = p_class_id
     and s.archived_at is null
     and s.status = 'active'
     and s.family_id is null
  on conflict (student_id, term_id) do update
    set current_bill = excluded.current_bill,
        balance = greatest(
          public.fee_accounts.arrears + excluded.current_bill - public.fee_accounts.total_paid,
          0
        );

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- Row Level Security ---------------------------------------------------------------
alter table public.family_fee_accounts enable row level security;

drop policy if exists "staff read family fee accounts" on public.family_fee_accounts;
create policy "staff read family fee accounts"
  on public.family_fee_accounts for select to authenticated using (true);

drop policy if exists "finance staff manage family fee accounts" on public.family_fee_accounts;
create policy "finance staff manage family fee accounts"
  on public.family_fee_accounts for all to authenticated
  using (public.has_role(array['admin', 'bursar']::public.app_role[]))
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

notify pgrst, 'reload schema';
