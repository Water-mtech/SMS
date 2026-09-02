\set ON_ERROR_STOP on
set role postgres;

-- The RPCs enforce roles, so the harness acts as a real administrator.
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'admin@school.ng')
on conflict do nothing;
update public.profiles set role = 'admin' where email = 'admin@school.ng';
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

-- Bypass RLS for the harness (policies are exercised separately below).
alter table public.students disable row level security;
alter table public.fee_accounts disable row level security;
alter table public.fee_payments disable row level security;
alter table public.stationery_issues disable row level security;
alter table public.promotion_batches disable row level security;
alter table public.promotion_records disable row level security;

\echo '=== 1. Seed check: sections/classes/items ==='
select (select count(*) from public.sections) as sections,
       (select count(*) from public.classes) as classes,
       (select count(*) from public.stationery_items) as items,
       (select count(*) from public.fee_structures) as fee_structures;

\echo '=== 2. Bulk import into Primary 1 ==='
select * from public.bulk_import_students(
  (select id from public.classes where slug = 'primary-1'),
  (select id from public.terms where is_current),
  '[
    {"admission_number":"BFS/001","first_name":"Grace","last_name":"Adeyemi","gender":"F","date_of_birth":"2016-05-12","guardian_name":"Tunde Adeyemi"},
    {"admission_number":"BFS/002","first_name":"Musa","last_name":"Ibrahim","gender":"male"},
    {"admission_number":"BFS/003","first_name":"Chioma","last_name":"Okeke","gender":"female"},
    {"admission_number":"BFS/001","first_name":"Duplicate","last_name":"Row"}
  ]'::jsonb
);

\echo '=== 3. Ledger opened at the Primary 1 bill (expect 165000) ==='
select s.admission_number, fa.arrears, fa.current_bill, fa.total_paid, fa.balance
  from public.fee_accounts fa join public.students s on s.id = fa.student_id
 where fa.term_id = (select id from public.terms where is_current)
 order by s.admission_number;

\echo '=== 4. Dual ledger: add arrears of 35000 to BFS/001 ==='
update public.fee_accounts set arrears = 35000
 where student_id = (select id from public.students where admission_number = 'BFS/001');
select arrears, current_bill, balance from public.fee_accounts
 where student_id = (select id from public.students where admission_number = 'BFS/001');

\echo '=== 5. Record a part payment of 20000 ==='
select receipt_number, amount, balance_before, balance_after
  from public.record_fee_payment(
    (select id from public.students where admission_number = 'BFS/001'),
    (select id from public.terms where is_current),
    20000, 'cash', 'TELLER-99', 'part payment');

\echo '=== 6. Overpayment must be rejected ==='
do $$
begin
  perform public.record_fee_payment(
    (select id from public.students where admission_number = 'BFS/002'),
    (select id from public.terms where is_current),
    999999);
  raise exception 'FAIL: overpayment was accepted';
exception when check_violation then
  raise notice 'PASS: overpayment rejected -> %', sqlerrm;
end $$;

\echo '=== 7. Void the payment, ledger restored ==='
select receipt_number, voided_at is not null as voided
  from public.void_fee_payment(
    (select id from public.fee_payments order by created_at desc limit 1), 'entered in error');
select total_paid, balance from public.fee_accounts
 where student_id = (select id from public.students where admission_number = 'BFS/001');

\echo '=== 8. Stationery: select-all then deselect one ==='
select count(*) as issued_after_select_all from public.set_student_stationery(
  (select id from public.students where admission_number = 'BFS/001'),
  (select id from public.terms where is_current),
  (select array_agg(i.id) from public.stationery_items i
     join public.sections s on s.id = i.section_id where s.slug = 'primary'));

select count(*) as issued_after_partial from public.set_student_stationery(
  (select id from public.students where admission_number = 'BFS/001'),
  (select id from public.terms where is_current),
  (select array_agg(i.id) from (
     select i.id from public.stationery_items i
       join public.sections s on s.id = i.section_id
      where s.slug = 'primary' order by i.display_order limit 2) i));

\echo '=== 9. Cross-section item must be rejected ==='
do $$
begin
  perform public.set_student_stationery(
    (select id from public.students where admission_number = 'BFS/001'),
    (select id from public.terms where is_current),
    array[(select i.id from public.stationery_items i
             join public.sections s on s.id = i.section_id
            where s.slug = 'senior-secondary' limit 1)]);
  raise exception 'FAIL: cross-section item accepted';
exception when check_violation then
  raise notice 'PASS: cross-section item rejected';
end $$;

\echo '=== 10. Matrix RPC ==='
select admission_number, full_name, array_length(issued_item_ids, 1) as issued
  from public.class_stationery_matrix(
    (select id from public.classes where slug = 'primary-1'),
    (select id from public.terms where is_current))
 order by admission_number;

\echo '=== 11. Promote Primary 1 -> Primary 2, rolling arrears forward ==='
select student_count, graduated_count, rolled_over_total
  from public.promote_class(
    (select id from public.classes where slug = 'primary-1'),
    (select id from public.terms where sequence = 1),
    (select id from public.terms where sequence = 2));

select s.admission_number, c.name as new_class, fa.arrears, fa.current_bill, fa.balance
  from public.students s
  join public.classes c on c.id = s.class_id
  join public.fee_accounts fa on fa.student_id = s.id and fa.term_id = (select id from public.terms where sequence = 2)
 order by s.admission_number;

\echo '=== 12. Re-running the same promotion must fail ==='
do $$
begin
  perform public.promote_class(
    (select id from public.classes where slug = 'primary-1'),
    (select id from public.terms where sequence = 1),
    (select id from public.terms where sequence = 2));
  raise exception 'FAIL: duplicate promotion accepted';
exception when unique_violation then
  raise notice 'PASS: duplicate promotion rejected';
end $$;

\echo '=== 13. Terminal class graduates instead of moving ==='
insert into public.students (admission_number, first_name, last_name, class_id)
values ('BFS/SS3', 'Final', 'Year', (select id from public.classes where slug = 'ss-3'));
select student_count, graduated_count from public.promote_class(
  (select id from public.classes where slug = 'ss-3'),
  (select id from public.terms where sequence = 1),
  (select id from public.terms where sequence = 2));
select admission_number, status from public.students where admission_number = 'BFS/SS3';

\echo '=== 14. Archive / restore ==='
select admission_number, status, archived_at is not null as archived
  from public.archive_student((select id from public.students where admission_number = 'BFS/003'), 'transferred');
select admission_number, status, archived_at is null as active
  from public.restore_student((select id from public.students where admission_number = 'BFS/003'));

\echo '=== 15. sync_class_fee_bills is idempotent ==='
select public.sync_class_fee_bills(
  (select id from public.classes where slug = 'primary-2'),
  (select id from public.terms where sequence = 1)) as affected_first;
