-- =============================================================================
-- Transactional business logic
-- =============================================================================
-- Every function below runs inside a single implicit transaction, takes the row
-- locks it needs up front, and raises a descriptive error rather than leaving
-- the ledger in a half-written state.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorisation guard.
--
-- RLS already blocks the underlying writes, but a policy-filtered row simply
-- disappears -- which surfaces as "not found" rather than "not allowed". These
-- functions check the caller's role up front so the UI can show an accurate
-- message, and so the intent of each operation is stated in one place.
-- -----------------------------------------------------------------------------
create or replace function public.require_role(roles public.app_role[], action text)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.has_role(roles) then
    raise exception 'You do not have permission to %', action
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stationery: replace a student's issued items for a term in one round trip.
-- The UI sends the full desired set; we diff it against what is stored so that
-- "Select All" and single-item toggles share exactly one code path.
-- -----------------------------------------------------------------------------
create or replace function public.set_student_stationery(
  p_student_id uuid,
  p_term_id uuid,
  p_item_ids uuid[]
)
returns setof public.stationery_issues
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_section_id uuid;
  v_invalid_count integer;
begin
  -- Serialise concurrent edits for this student/term. A transaction-level
  -- advisory lock is used rather than `SELECT ... FOR UPDATE` on students,
  -- because row locking additionally requires an UPDATE policy on that table --
  -- which teachers, who legitimately issue stationery, do not have.
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || p_term_id::text, 0));

  select c.section_id
    into v_section_id
    from public.students s
    join public.classes c on c.id = s.class_id
   where s.id = p_student_id
     and s.archived_at is null;

  if v_section_id is null then
    raise exception 'Student % not found or archived', p_student_id
      using errcode = 'no_data_found';
  end if;

  -- Every requested item must belong to the student's own section.
  select count(*)
    into v_invalid_count
    from unnest(coalesce(p_item_ids, '{}'::uuid[])) as requested(item_id)
    left join public.stationery_items i
      on i.id = requested.item_id and i.section_id = v_section_id and i.is_active
   where i.id is null;

  if v_invalid_count > 0 then
    raise exception 'Request contains % stationery item(s) outside this student''s section', v_invalid_count
      using errcode = 'check_violation';
  end if;

  delete from public.stationery_issues si
   where si.student_id = p_student_id
     and si.term_id = p_term_id
     and not (si.item_id = any (coalesce(p_item_ids, '{}'::uuid[])));

  insert into public.stationery_issues (student_id, item_id, term_id, issued_by)
  select p_student_id, requested.item_id, p_term_id, v_actor
    from unnest(coalesce(p_item_ids, '{}'::uuid[])) as requested(item_id)
  on conflict (student_id, item_id, term_id) do nothing;

  return query
    select * from public.stationery_issues si
     where si.student_id = p_student_id and si.term_id = p_term_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stationery: the whole class matrix in a single query.
-- Returns one row per student with an array of the item ids they have received,
-- which the UI turns into check / dash cells without any N+1 fetching.
-- -----------------------------------------------------------------------------
create or replace function public.class_stationery_matrix(
  p_class_id uuid,
  p_term_id uuid
)
returns table (
  student_id uuid,
  admission_number text,
  full_name text,
  issued_item_ids uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.admission_number,
    public.student_full_name(s),
    coalesce(
      array_agg(si.item_id order by si.item_id) filter (where si.item_id is not null),
      '{}'::uuid[]
    )
  from public.students s
  left join public.stationery_issues si
    on si.student_id = s.id and si.term_id = p_term_id
  where s.class_id = p_class_id
    and s.archived_at is null
    and s.status = 'active'
  group by s.id
  order by s.last_name, s.first_name;
$$;

-- -----------------------------------------------------------------------------
-- Fees: materialise this term's bill for a class from its fee structure.
-- Idempotent — re-running it re-syncs current_bill without touching payments.
-- -----------------------------------------------------------------------------
create or replace function public.sync_class_fee_bills(
  p_class_id uuid,
  p_term_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_amount numeric(12, 2);
  v_affected integer;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'publish fee structures');

  select amount into v_amount
    from public.fee_structures
   where class_id = p_class_id and term_id = p_term_id;

  if v_amount is null then
    raise exception 'No fee structure defined for this class and term'
      using errcode = 'no_data_found';
  end if;

  insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
  select s.id, p_term_id, p_class_id, 0, v_amount
    from public.students s
   where s.class_id = p_class_id
     and s.archived_at is null
     and s.status = 'active'
  on conflict (student_id, term_id) do update
    set current_bill = excluded.current_bill,
        class_id = excluded.class_id
    -- Never shrink a bill below what has already been collected.
    where public.fee_accounts.total_paid <= public.fee_accounts.arrears + excluded.current_bill;

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fees: record a payment and mint its receipt, atomically.
-- -----------------------------------------------------------------------------
create or replace function public.record_fee_payment(
  p_student_id uuid,
  p_term_id uuid,
  p_amount numeric,
  p_method public.payment_method default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default now()
)
returns public.fee_payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account public.fee_accounts;
  v_payment public.fee_payments;
  v_balance_before numeric(12, 2);
  v_receipt_number text;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'record payments');

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero'
      using errcode = 'check_violation';
  end if;

  -- Serialise concurrent payments for the same student/term.
  select * into v_account
    from public.fee_accounts
   where student_id = p_student_id and term_id = p_term_id
   for update;

  if v_account.id is null then
    raise exception 'This student has no fee account for the selected term'
      using errcode = 'no_data_found';
  end if;

  v_balance_before := v_account.balance;

  if p_amount > v_balance_before then
    raise exception 'Payment of % exceeds the outstanding balance of %', p_amount, v_balance_before
      using errcode = 'check_violation';
  end if;

  v_receipt_number := 'RCP-' || to_char(nextval('public.receipt_number_seq'), 'FM000000');

  update public.fee_accounts
     set total_paid = total_paid + p_amount
   where id = v_account.id;

  insert into public.fee_payments (
    account_id, student_id, term_id, receipt_number, amount, method,
    reference, notes, balance_before, balance_after, paid_at, recorded_by
  )
  values (
    v_account.id, p_student_id, p_term_id, v_receipt_number, p_amount, p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_balance_before, v_balance_before - p_amount, coalesce(p_paid_at, now()), auth.uid()
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fees: void a payment and restore the ledger.
-- -----------------------------------------------------------------------------
create or replace function public.void_fee_payment(
  p_payment_id uuid,
  p_reason text
)
returns public.fee_payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payment public.fee_payments;
begin
  perform public.require_role(array['admin', 'bursar']::public.app_role[], 'void receipts');

  select * into v_payment from public.fee_payments where id = p_payment_id for update;

  if v_payment.id is null then
    raise exception 'Payment not found' using errcode = 'no_data_found';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'Payment % is already voided', v_payment.receipt_number
      using errcode = 'check_violation';
  end if;

  perform 1 from public.fee_accounts where id = v_payment.account_id for update;

  update public.fee_accounts
     set total_paid = total_paid - v_payment.amount
   where id = v_payment.account_id;

  update public.fee_payments
     set voided_at = now(),
         voided_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roster: promote an entire class and roll uncleared balances forward.
--
-- For every active student in p_from_class_id:
--   * move them to the class whose promotion_order is one higher, or mark them
--     graduated when the class is terminal (SS 3);
--   * open their next-term ledger with arrears = whatever they still owe, and
--     current_bill taken from the destination class's fee structure.
--
-- A unique index on (from_class, from_term, to_term) makes the whole operation
-- safe to retry: a second run fails loudly instead of double-charging arrears.
-- -----------------------------------------------------------------------------
create or replace function public.promote_class(
  p_from_class_id uuid,
  p_from_term_id uuid,
  p_to_term_id uuid
)
returns public.promotion_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from_class public.classes;
  v_to_class public.classes;
  v_from_term public.terms;
  v_to_term public.terms;
  v_batch public.promotion_batches;
  v_student record;
  v_outstanding numeric(12, 2);
  v_next_bill numeric(12, 2);
  v_promoted integer := 0;
  v_graduated integer := 0;
  v_rolled numeric(12, 2) := 0;
begin
  perform public.require_role(array['admin']::public.app_role[], 'promote classes');

  select * into v_from_class from public.classes where id = p_from_class_id;
  if v_from_class.id is null then
    raise exception 'Source class not found' using errcode = 'no_data_found';
  end if;

  select * into v_from_term from public.terms where id = p_from_term_id;
  select * into v_to_term from public.terms where id = p_to_term_id;

  if v_from_term.id is null or v_to_term.id is null then
    raise exception 'Both the source and destination terms must exist'
      using errcode = 'no_data_found';
  end if;

  if v_to_term.sequence <= v_from_term.sequence then
    raise exception 'The destination term must come after the source term'
      using errcode = 'check_violation';
  end if;

  if not v_from_class.is_terminal then
    select * into v_to_class
      from public.classes
     where promotion_order = v_from_class.promotion_order + 1;

    if v_to_class.id is null then
      raise exception 'No class follows % in the promotion order', v_from_class.name
        using errcode = 'no_data_found';
    end if;
  end if;

  insert into public.promotion_batches (
    from_class_id, to_class_id, from_term_id, to_term_id, performed_by
  )
  values (p_from_class_id, v_to_class.id, p_from_term_id, p_to_term_id, auth.uid())
  returning * into v_batch;

  if v_to_class.id is not null then
    select amount into v_next_bill
      from public.fee_structures
     where class_id = v_to_class.id and term_id = p_to_term_id;
  end if;
  v_next_bill := coalesce(v_next_bill, 0);

  for v_student in
    select s.id
      from public.students s
     where s.class_id = p_from_class_id
       and s.archived_at is null
       and s.status = 'active'
     order by s.last_name, s.first_name
     for update of s
  loop
    select greatest(coalesce(fa.balance, 0), 0)
      into v_outstanding
      from public.fee_accounts fa
     where fa.student_id = v_student.id and fa.term_id = p_from_term_id
     for update;

    v_outstanding := coalesce(v_outstanding, 0);

    if v_to_class.id is null then
      update public.students
         set status = 'graduated'
       where id = v_student.id;
      v_graduated := v_graduated + 1;
    else
      update public.students
         set class_id = v_to_class.id
       where id = v_student.id;

      insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
      values (v_student.id, p_to_term_id, v_to_class.id, v_outstanding, v_next_bill)
      on conflict (student_id, term_id) do update
        set arrears = public.fee_accounts.arrears + excluded.arrears,
            class_id = excluded.class_id,
            current_bill = greatest(public.fee_accounts.current_bill, excluded.current_bill);

      v_promoted := v_promoted + 1;
      v_rolled := v_rolled + v_outstanding;
    end if;

    insert into public.promotion_records (
      batch_id, student_id, from_class_id, to_class_id, rolled_over_balance, graduated
    )
    values (
      v_batch.id, v_student.id, p_from_class_id, v_to_class.id,
      case when v_to_class.id is null then 0 else v_outstanding end,
      v_to_class.id is null
    );
  end loop;

  update public.promotion_batches
     set student_count = v_promoted,
         graduated_count = v_graduated,
         rolled_over_total = v_rolled
   where id = v_batch.id
  returning * into v_batch;

  return v_batch;
end;
$$;

create unique index if not exists promotion_batches_unique_run_idx
  on public.promotion_batches (from_class_id, from_term_id, to_term_id);

-- -----------------------------------------------------------------------------
-- Roster: bulk import. Accepts the parsed rows as jsonb so a whole spreadsheet
-- lands in one transaction — either every valid row is inserted or none are.
-- -----------------------------------------------------------------------------
create or replace function public.bulk_import_students(
  p_class_id uuid,
  p_term_id uuid,
  p_rows jsonb
)
returns table (imported integer, skipped integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_imported integer;
  v_bill numeric(12, 2);
begin
  perform public.require_role(array['admin']::public.app_role[], 'import students');

  select count(*) into v_total from jsonb_array_elements(p_rows);

  with parsed as (
    select
      btrim(row_data ->> 'admission_number') as admission_number,
      btrim(row_data ->> 'first_name') as first_name,
      btrim(row_data ->> 'last_name') as last_name,
      nullif(btrim(coalesce(row_data ->> 'middle_name', '')), '') as middle_name,
      case lower(nullif(btrim(coalesce(row_data ->> 'gender', '')), ''))
        when 'male' then 'male'::public.gender
        when 'm' then 'male'::public.gender
        when 'female' then 'female'::public.gender
        when 'f' then 'female'::public.gender
        else null
      end as gender,
      (nullif(btrim(coalesce(row_data ->> 'date_of_birth', '')), ''))::date as date_of_birth,
      nullif(btrim(coalesce(row_data ->> 'guardian_name', '')), '') as guardian_name,
      nullif(btrim(coalesce(row_data ->> 'guardian_phone', '')), '') as guardian_phone,
      nullif(btrim(coalesce(row_data ->> 'guardian_email', '')), '') as guardian_email
    from jsonb_array_elements(p_rows) as row_data
  ),
  inserted as (
    insert into public.students (
      admission_number, first_name, last_name, middle_name, gender,
      date_of_birth, class_id, guardian_name, guardian_phone, guardian_email
    )
    select
      admission_number, first_name, last_name, middle_name, gender,
      date_of_birth, p_class_id, guardian_name, guardian_phone, guardian_email
    from parsed
    where admission_number <> '' and first_name <> '' and last_name <> ''
    on conflict (admission_number) do nothing
    returning id
  )
  select count(*) into v_imported from inserted;

  -- Give the new intake this term's ledger straight away when a fee structure exists.
  select amount into v_bill
    from public.fee_structures
   where class_id = p_class_id and term_id = p_term_id;

  if v_bill is not null then
    insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
    select s.id, p_term_id, p_class_id, 0, v_bill
      from public.students s
     where s.class_id = p_class_id and s.archived_at is null and s.status = 'active'
    on conflict (student_id, term_id) do nothing;
  end if;

  return query select v_imported, v_total - v_imported;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roster: soft delete / restore.
-- -----------------------------------------------------------------------------
create or replace function public.archive_student(
  p_student_id uuid,
  p_reason text default null
)
returns public.students
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student public.students;
begin
  perform public.require_role(array['admin']::public.app_role[], 'archive students');

  update public.students
     set archived_at = now(),
         archived_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         status = 'withdrawn'
   where id = p_student_id and archived_at is null
  returning * into v_student;

  if v_student.id is null then
    raise exception 'Student not found or already archived' using errcode = 'no_data_found';
  end if;

  return v_student;
end;
$$;

create or replace function public.restore_student(p_student_id uuid)
returns public.students
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student public.students;
begin
  perform public.require_role(array['admin']::public.app_role[], 'restore students');

  update public.students
     set archived_at = null,
         archived_reason = null,
         status = 'active'
   where id = p_student_id and archived_at is not null
  returning * into v_student;

  if v_student.id is null then
    raise exception 'Student not found or is not archived' using errcode = 'no_data_found';
  end if;

  return v_student;
end;
$$;
