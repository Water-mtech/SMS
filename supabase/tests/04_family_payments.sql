-- =============================================================================
-- Families: grouping siblings and paying for them together.
-- Run after 00_supabase_stub.sql and every migration. See README.md.
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;

-- An admin to act as, and the current term ------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, role)
values ('11111111-1111-1111-1111-111111111111', 'Test Admin', 'admin@test.local', 'admin')
on conflict (id) do update set role = 'admin';

-- Supabase grants these to the authenticated role; the stub does not.
grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- Three siblings in three different classes ------------------------------------
create temp table ctx on commit drop as
select
  (select id from public.terms where is_current limit 1) as term_id,
  (select id from public.classes where slug = 'jss-2')    as jss2,
  (select id from public.classes where slug = 'primary-3') as pry3,
  (select id from public.classes where slug = 'nursery-1') as nur1;

insert into public.families (id, name, phone)
values ('22222222-2222-2222-2222-222222222222', 'Alhaji Musa Ibrahim', '08031234567');

insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-333333333331', 'FAM/001', 'Musa', 'Ibrahim', jss2 from ctx;
insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-333333333332', 'FAM/002', 'Aisha', 'Ibrahim', pry3 from ctx;
insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-333333333333', 'FAM/003', 'Khalid', 'Ibrahim', nur1 from ctx;

-- A pupil from another household, to prove isolation.
insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-333333333339', 'OTH/001', 'Stranger', 'Child', jss2 from ctx;

-- Ledgers: 80,000 / 60,000 / 40,000 owing, and 25,000 for the outsider.
insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
select '33333333-3333-3333-3333-333333333331', term_id, jss2, 0, 80000 from ctx;
insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
select '33333333-3333-3333-3333-333333333332', term_id, pry3, 10000, 50000 from ctx;
insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
select '33333333-3333-3333-3333-333333333333', term_id, nur1, 0, 40000 from ctx;
insert into public.fee_accounts (student_id, term_id, class_id, arrears, current_bill)
select '33333333-3333-3333-3333-333333333339', term_id, jss2, 0, 25000 from ctx;

-- === 1. Grouping pupils into a household =====================================
select case
  when public.set_student_family(
        '22222222-2222-2222-2222-222222222222',
        array['33333333-3333-3333-3333-333333333331',
              '33333333-3333-3333-3333-333333333332',
              '33333333-3333-3333-3333-333333333333']::uuid[]) = 3
  then 'PASS  three siblings joined the family'
  else 'FAIL  set_student_family did not report three rows'
end;

-- === 2. Family outstanding is the sum of the children, and only them =========
select case
  when outstanding = 180000 and children = 3
  then 'PASS  family outstanding is 180,000 across 3 children'
  else format('FAIL  expected 180000/3, got %s/%s', outstanding, children)
end
from public.family_balances
where family_id = '22222222-2222-2222-2222-222222222222';

-- === 3. A part payment splits across the children ============================
select public.record_family_payment(
  '22222222-2222-2222-2222-222222222222',
  (select term_id from ctx),
  jsonb_build_array(
    jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333331', 'amount', 30000),
    jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333332', 'amount', 15000),
    jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333333', 'amount',  5000)
  )
) as ignored \gset

select case
  when outstanding = 130000
  then 'PASS  50,000 paid leaves the family owing 130,000'
  else format('FAIL  expected 130000, got %s', outstanding)
end
from public.family_balances
where family_id = '22222222-2222-2222-2222-222222222222';

-- === 4. Each child got their own numbered receipt ============================
select case
  when count(*) = 3 and count(distinct receipt_number) = 3
       and count(distinct family_payment_id) = 1
  then 'PASS  three individual receipts, all tied to one family payment'
  else format('FAIL  got %s payments / %s receipts', count(*), count(distinct receipt_number))
end
from public.fee_payments
where family_payment_id is not null;

-- === 5. The per-child ledgers each moved by their own amount =================
select case
  when sum(case when student_id = '33333333-3333-3333-3333-333333333331' and balance = 50000 then 1 else 0 end) = 1
   and sum(case when student_id = '33333333-3333-3333-3333-333333333332' and balance = 45000 then 1 else 0 end) = 1
   and sum(case when student_id = '33333333-3333-3333-3333-333333333333' and balance = 35000 then 1 else 0 end) = 1
  then 'PASS  each child''s balance moved by their own allocation'
  else 'FAIL  per-child balances are wrong'
end
from public.fee_accounts
where term_id = (select term_id from ctx)
  and student_id in ('33333333-3333-3333-3333-333333333331',
                     '33333333-3333-3333-3333-333333333332',
                     '33333333-3333-3333-3333-333333333333');

-- === 6. The family receipt snapshots what the parent was told ================
select case
  when balance_before = 180000 and balance_after = 130000 and total_amount = 50000
       and receipt_number like 'FAM-%'
  then 'PASS  family receipt snapshot reads 180,000 -> 130,000'
  else format('FAIL  snapshot %s -> %s for %s', balance_before, balance_after, total_amount)
end
from public.family_payments
where family_id = '22222222-2222-2222-2222-222222222222';

-- === 7. Overpaying one child is refused, and nothing is written ==============
do $$
declare
  v_before numeric;
  v_after numeric;
begin
  select outstanding into v_before from public.family_balances
   where family_id = '22222222-2222-2222-2222-222222222222';

  begin
    perform public.record_family_payment(
      '22222222-2222-2222-2222-222222222222',
      (select id from public.terms where is_current limit 1),
      jsonb_build_array(
        -- Khalid owes 35,000; this line is 1,000 too much.
        jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333333', 'amount', 36000),
        jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333331', 'amount', 10000)
      ));
    raise notice 'FAIL  an overpayment was accepted';
    return;
  exception when check_violation then
    null;  -- expected
  end;

  select outstanding into v_after from public.family_balances
   where family_id = '22222222-2222-2222-2222-222222222222';

  if v_before = v_after then
    raise notice 'PASS  overpaying one child fails the whole handover, ledgers untouched';
  else
    raise notice 'FAIL  a rejected payment still moved the ledger: % -> %', v_before, v_after;
  end if;
end $$;

-- === 8. A pupil from another household cannot be paid for here ==============
do $$
begin
  perform public.record_family_payment(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.terms where is_current limit 1),
    jsonb_build_array(
      jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333339', 'amount', 5000)
    ));
  raise notice 'FAIL  an outsider was paid for through this family';
exception when no_data_found then
  raise notice 'PASS  a pupil outside the family is refused';
end $$;

-- === 9. An archived child drops out of the family total =====================
do $$
declare
  v_outstanding numeric;
begin
  perform public.archive_student('33333333-3333-3333-3333-333333333333', 'Left the school');

  select outstanding into v_outstanding from public.family_balances
   where family_id = '22222222-2222-2222-2222-222222222222';

  -- Khalid's 35,000 no longer counts: 130,000 - 35,000.
  if v_outstanding = 95000 then
    raise notice 'PASS  an archived child leaves the family total';
  else
    raise notice 'FAIL  expected 95000 after archiving, got %', v_outstanding;
  end if;
end $$;

-- === 10. A teacher may read families but never take money ===================
set local role pgtest;
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'teacher@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role)
values ('44444444-4444-4444-4444-444444444444', 'Test Teacher', 'teacher@test.local', 'teacher')
on conflict (id) do update set role = 'teacher';

set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

do $$
begin
  perform public.record_family_payment(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.terms where is_current limit 1),
    jsonb_build_array(
      jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333331', 'amount', 1000)
    ));
  raise notice 'FAIL  a teacher recorded a family payment';
exception when insufficient_privilege then
  raise notice 'PASS  a teacher cannot record a family payment';
end $$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.families;
  if v_count >= 1 then
    raise notice 'PASS  a teacher can still read families';
  else
    raise notice 'FAIL  a teacher cannot read families';
  end if;
end $$;

rollback;
