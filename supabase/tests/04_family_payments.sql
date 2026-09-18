-- =============================================================================
-- Families: grouping siblings, and one fee for the whole household.
-- Run after 00_supabase_stub.sql and every migration. See README.md.
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;

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

create temp table ctx on commit drop as
select
  (select id from public.terms where is_current limit 1)   as term_id,
  (select id from public.classes where slug = 'jss-2')     as jss2,
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

-- === 2. One fee for the household, spanning three classes ====================
select case
  when balance = 180000 and current_bill = 180000
  then 'PASS  one fee covers the whole household'
  else format('FAIL  balance %s, bill %s', balance, current_bill)
end
from public.set_family_fee(
  '22222222-2222-2222-2222-222222222222', (select term_id from ctx), 0, 180000);

select case
  when outstanding = 180000 and children = 3
  then 'PASS  the family owes 180,000 across 3 children'
  else format('FAIL  outstanding %s, children %s', outstanding, children)
end
from public.family_balances
where family_id = '22222222-2222-2222-2222-222222222222';

-- === 3. A part payment moves the single household figure =====================
select case
  when total_amount = 50000 and balance_before = 180000 and balance_after = 130000
  then 'PASS  50,000 paid leaves the family owing 130,000'
  else format('FAIL  %s: %s -> %s', total_amount, balance_before, balance_after)
end
from public.record_family_payment(
  '22222222-2222-2222-2222-222222222222', (select term_id from ctx), 50000);

-- === 4. The children carry no separate ledger ================================
select case
  when count(*) = 0
  then 'PASS  no per-child fee account is created for a family'
  else format('FAIL  %s stray child account(s)', count(*))
end
from public.fee_accounts
where student_id in ('33333333-3333-3333-3333-333333333331',
                     '33333333-3333-3333-3333-333333333332',
                     '33333333-3333-3333-3333-333333333333');

-- === 5. The receipt snapshots what the parent was told =======================
select case
  when balance_before = 180000 and balance_after = 130000 and receipt_number like 'FAM-%'
  then 'PASS  family receipt snapshot reads 180,000 -> 130,000'
  else format('FAIL  snapshot %s -> %s', balance_before, balance_after)
end
from public.family_payments
where family_id = '22222222-2222-2222-2222-222222222222';

-- === 6. Overpaying the household is kept in full =============================
do $$
declare
  v_amount numeric;
  v_after numeric;
begin
  select total_amount, balance_after into v_amount, v_after
    from public.record_family_payment(
      '22222222-2222-2222-2222-222222222222',
      (select id from public.terms where is_current limit 1),
      200000);

  if v_amount = 200000 and v_after = 0 then
    raise notice 'PASS  200,000 against 130,000 owing is recorded in full and clears it';
  else
    raise notice 'FAIL  amount %, outstanding after %', v_amount, v_after;
  end if;
end $$;

-- === 7. Hidden charges: still owing after an overpayment =====================
do $$
declare
  v_after numeric;
begin
  perform public.set_family_fee(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.terms where is_current limit 1), 0, 100000);

  select balance_after into v_after from public.record_family_payment(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.terms where is_current limit 1),
    130000, 'cash', null, null, now(), 20000);

  if v_after = 20000 then
    raise notice 'PASS  130,000 paid on a 100,000 fee can still leave 20,000 owing';
  else
    raise notice 'FAIL  expected 20000, got %', v_after;
  end if;
end $$;

-- === 8. Paying a household with no fee set is refused ========================
do $$
begin
  insert into public.families (id, name) values
    ('22222222-2222-2222-2222-222222222299', 'Unbilled Family');

  perform public.record_family_payment(
    '22222222-2222-2222-2222-222222222299',
    (select id from public.terms where is_current limit 1), 5000);
  raise notice 'FAIL  a family with no fee took a payment';
exception when no_data_found then
  raise notice 'PASS  a family with no fee set cannot take a payment';
end $$;

-- === 9. Archiving a child leaves the household fee alone =====================
do $$
declare
  v_outstanding numeric;
  v_children integer;
begin
  perform public.archive_student('33333333-3333-3333-3333-333333333333', 'Left the school');

  select outstanding, children into v_outstanding, v_children
    from public.family_balances
   where family_id = '22222222-2222-2222-2222-222222222222';

  -- The fee is the household's, so losing a child changes the roll, not the debt.
  if v_outstanding = 20000 and v_children = 2 then
    raise notice 'PASS  an archived child leaves the roll without altering the fee';
  else
    raise notice 'FAIL  outstanding %, children %', v_outstanding, v_children;
  end if;
end $$;

-- === 10. A teacher may read families but never take money ====================
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
    (select id from public.terms where is_current limit 1), 1000);
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
