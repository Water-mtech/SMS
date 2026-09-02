\set ON_ERROR_STOP on
set role postgres;

-- Re-enable RLS on the tables the logic test disabled it for.
alter table public.students enable row level security;
alter table public.fee_accounts enable row level security;
alter table public.fee_payments enable row level security;
alter table public.stationery_issues enable row level security;
alter table public.promotion_batches enable row level security;
alter table public.promotion_records enable row level security;

-- Grants normally applied by Supabase to the API roles.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'teacher@school.ng'),
  ('22222222-2222-2222-2222-222222222222', 'bursar@school.ng')
on conflict do nothing;

update public.profiles set role = 'teacher' where email = 'teacher@school.ng';
update public.profiles set role = 'bursar'  where email = 'bursar@school.ng';
select email, role from public.profiles order by email;

\echo '=== Teacher: can read students ==='
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) > 0 as can_read_students from public.students;

\echo '=== Teacher: cannot insert a student (admin only) ==='
do $$
begin
  insert into public.students (admission_number, first_name, last_name, class_id)
  values ('RLS/TEST', 'Should', 'Fail', (select id from public.classes where slug = 'jss-1'));
  raise exception 'FAIL: teacher inserted a student';
exception when insufficient_privilege then
  raise notice 'PASS: teacher blocked from inserting students';
end $$;

\echo '=== Teacher: can issue stationery ==='
select count(*) as items_issued from public.set_student_stationery(
  (select id from public.students where admission_number = 'BFS/002'),
  (select id from public.terms where sequence = 1),
  (select array_agg(i.id) from public.stationery_items i
     join public.sections s on s.id = i.section_id where s.slug = 'primary'));

\echo '=== Teacher: cannot record a payment (finance only) ==='
do $$
begin
  perform public.record_fee_payment(
    (select id from public.students where admission_number = 'BFS/002'),
    (select id from public.terms where sequence = 2), 1000);
  raise exception 'FAIL: teacher recorded a payment';
exception when insufficient_privilege then
  raise notice 'PASS: teacher blocked from recording payments';
end $$;

\echo '=== Bursar: can record a payment ==='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select receipt_number, amount, balance_before, balance_after
  from public.record_fee_payment(
    (select id from public.students where admission_number = 'BFS/002'),
    (select id from public.terms where sequence = 2), 65000, 'bank_transfer');

\echo '=== Bursar: cannot run a promotion (admin only) ==='
do $$
begin
  perform public.promote_class(
    (select id from public.classes where slug = 'jss-1'),
    (select id from public.terms where sequence = 1),
    (select id from public.terms where sequence = 2));
  raise exception 'FAIL: bursar ran a promotion';
exception when insufficient_privilege then
  raise notice 'PASS: bursar blocked from running promotions';
end $$;

reset role;
