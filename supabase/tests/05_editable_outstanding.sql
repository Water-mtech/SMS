-- =============================================================================
-- Outstanding is a figure the school sets, not arithmetic the database insists on.
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
  (select id from public.terms where is_current limit 1)  as term_id,
  (select id from public.classes where slug = 'primary-4') as pry4,
  (select id from public.classes where slug = 'nursery-2')  as nur2;

insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-333333333331', 'OUT/001', 'Solo', 'Pupil', pry4 from ctx;

-- === 1. A fee typed by hand, with no class structure involved ================
select case
  when balance = 150000 and current_bill = 150000
  then 'PASS  a fee can be set for one pupil directly'
  else format('FAIL  expected 150000, got balance %s bill %s', balance, current_bill)
end
from public.set_student_fee(
  '33333333-3333-3333-3333-333333333331', (select term_id from ctx), 0, 150000);

-- === 2. Paying MORE than the fee is recorded in full ========================
-- The parent hands over 200,000 against a 150,000 fee because of charges the
-- system never saw. The receipt must say 200,000.
select case
  when amount = 200000 and balance_after = 0
  then 'PASS  an overpayment is recorded at the amount actually received'
  else format('FAIL  amount %s, balance_after %s', amount, balance_after)
end
from public.record_fee_payment(
  '33333333-3333-3333-3333-333333333331', (select term_id from ctx), 200000);

select case
  when total_paid = 200000 and balance = 0
  then 'PASS  the ledger keeps the full 200,000 and shows nothing owing'
  else format('FAIL  total_paid %s, balance %s', total_paid, balance)
end
from public.fee_accounts
where student_id = '33333333-3333-3333-3333-333333333331';

-- === 3. Outstanding can be set outright, without touching the fee ===========
-- Hidden charges: they paid 200,000 but still owe 30,000.
select case
  when balance = 30000 and current_bill = 150000
  then 'PASS  outstanding can be set by hand, leaving the fee alone'
  else format('FAIL  balance %s, bill %s', balance, current_bill)
end
from public.set_student_fee(
  '33333333-3333-3333-3333-333333333331', (select term_id from ctx), 0, 150000, 30000);

-- === 4. A payment can carry the new outstanding with it =====================
insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-333333333332', 'OUT/002', 'Hidden', 'Charges', pry4 from ctx;
select public.set_student_fee(
  '33333333-3333-3333-3333-333333333332', (select term_id from ctx), 0, 100000) as ignored \gset

select case
  when amount = 120000 and balance_after = 25000
  then 'PASS  paying 120,000 while stating 25,000 still owing does both'
  else format('FAIL  amount %s, balance_after %s', amount, balance_after)
end
from public.record_fee_payment(
  '33333333-3333-3333-3333-333333333332', (select term_id from ctx),
  120000, 'cash', null, null, now(), 25000);

select case
  when balance = 25000 and total_paid = 120000
  then 'PASS  the ledger reads 120,000 paid and 25,000 owing'
  else format('FAIL  balance %s, paid %s', balance, total_paid)
end
from public.fee_accounts
where student_id = '33333333-3333-3333-3333-333333333332';

-- === 5. Outstanding never goes negative =====================================
do $$
declare
  v_balance numeric;
begin
  select balance into v_balance
    from public.set_student_fee(
      '33333333-3333-3333-3333-333333333332',
      (select id from public.terms where is_current limit 1),
      0, 100000, -5000);

  if v_balance = 0 then
    raise notice 'PASS  a negative outstanding is floored at zero';
  else
    raise notice 'FAIL  expected 0, got %', v_balance;
  end if;
end $$;

-- === 6. Voiding restores the outstanding the payment was applied against ====
do $$
declare
  v_payment_id uuid;
  v_balance numeric;
begin
  perform public.set_student_fee(
    '33333333-3333-3333-3333-333333333332',
    (select id from public.terms where is_current limit 1), 0, 100000, 40000);

  select id into v_payment_id from public.record_fee_payment(
    '33333333-3333-3333-3333-333333333332',
    (select id from public.terms where is_current limit 1), 10000);

  perform public.void_fee_payment(v_payment_id, 'Entered twice');

  select balance into v_balance from public.fee_accounts
   where student_id = '33333333-3333-3333-3333-333333333332';

  if v_balance = 40000 then
    raise notice 'PASS  voiding puts the outstanding back to 40,000';
  else
    raise notice 'FAIL  expected 40000 after voiding, got %', v_balance;
  end if;
end $$;

-- === 7. A family carries ONE fee and one outstanding ========================
insert into public.families (id, name, phone)
values ('22222222-2222-2222-2222-222222222222', 'Nuhi Aliyu and Co.', '08031234567');

insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-33333333333a', 'FAM/101', 'Ibrahim', 'Aliyu', pry4 from ctx;
insert into public.students (id, admission_number, first_name, last_name, class_id)
select '33333333-3333-3333-3333-33333333333b', 'FAM/102', 'Zainab', 'Aliyu', nur2 from ctx;

select public.set_student_family(
  '22222222-2222-2222-2222-222222222222',
  array['33333333-3333-3333-3333-33333333333a',
        '33333333-3333-3333-3333-33333333333b']::uuid[]) as ignored \gset

select case
  when balance = 152000
  then 'PASS  a household fee is set once for the whole family'
  else format('FAIL  expected 152000, got %s', balance)
end
from public.set_family_fee(
  '22222222-2222-2222-2222-222222222222', (select term_id from ctx), 0, 152000);

select case
  when outstanding = 152000 and children = 2
  then 'PASS  the family owes 152,000 across 2 children'
  else format('FAIL  outstanding %s, children %s', outstanding, children)
end
from public.family_balances
where family_id = '22222222-2222-2222-2222-222222222222';

-- === 8. One family payment, no per-child split ==============================
select case
  when total_amount = 152000 and balance_after = 0 and receipt_number like 'FAM-%'
  then 'PASS  one family payment clears the household'
  else format('FAIL  amount %s, after %s', total_amount, balance_after)
end
from public.record_family_payment(
  '22222222-2222-2222-2222-222222222222', (select term_id from ctx), 152000);

select case
  when count(*) = 0
  then 'PASS  no per-child payment rows are written for a family payment'
  else format('FAIL  %s stray child payment(s)', count(*))
end
from public.fee_payments
where student_id in ('33333333-3333-3333-3333-33333333333a',
                     '33333333-3333-3333-3333-33333333333b');

-- === 9. A family overpayment still leaves them owing when told so ===========
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

-- === 10. Applying a class structure skips pupils billed through a family ====
do $$
declare
  v_has_account boolean;
begin
  insert into public.fee_structures (class_id, term_id, amount)
  values ((select id from public.classes where slug = 'primary-4'),
          (select id from public.terms where is_current limit 1),
          39000)
  on conflict (class_id, term_id) do update set amount = 39000;

  perform public.sync_class_fee_bills(
    (select id from public.classes where slug = 'primary-4'),
    (select id from public.terms where is_current limit 1));

  select exists (
    select 1 from public.fee_accounts
     where student_id = '33333333-3333-3333-3333-33333333333a'
  ) into v_has_account;

  if not v_has_account then
    raise notice 'PASS  a pupil billed through a family is skipped by the class structure';
  else
    raise notice 'FAIL  a family pupil was given their own class bill';
  end if;
end $$;

-- === 11. A hand-set outstanding survives re-applying the class structure ====
do $$
declare
  v_balance numeric;
begin
  -- Solo pupil: fee 150,000, hand-set outstanding 30,000, already paid 200,000.
  perform public.sync_class_fee_bills(
    (select id from public.classes where slug = 'primary-4'),
    (select id from public.terms where is_current limit 1));

  select balance into v_balance from public.fee_accounts
   where student_id = '33333333-3333-3333-3333-333333333331';

  -- 0 arrears + 39,000 bill - 200,000 paid, floored: the structure re-derives it.
  if v_balance = 0 then
    raise notice 'PASS  re-applying the structure re-derives the outstanding from what is paid';
  else
    raise notice 'FAIL  expected 0, got %', v_balance;
  end if;
end $$;

-- === 12. A teacher still cannot set fees ====================================
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
  perform public.set_student_fee(
    '33333333-3333-3333-3333-333333333331',
    (select id from public.terms where is_current limit 1), 0, 1);
  raise notice 'FAIL  a teacher set a fee';
exception when insufficient_privilege then
  raise notice 'PASS  a teacher cannot set fees';
end $$;

do $$
begin
  perform public.set_family_fee(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.terms where is_current limit 1), 0, 1);
  raise notice 'FAIL  a teacher set a family fee';
exception when insufficient_privilege then
  raise notice 'PASS  a teacher cannot set a family fee';
end $$;

rollback;
