\set ON_ERROR_STOP on
set role postgres;

-- Catalogue management is admin-only; act as a real administrator.
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'catalogue-admin@school.ng'),
  ('55555555-5555-5555-5555-555555555555', 'catalogue-teacher@school.ng')
on conflict do nothing;
update public.profiles set role = 'admin'   where email = 'catalogue-admin@school.ng';
update public.profiles set role = 'teacher' where email = 'catalogue-teacher@school.ng';

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

\echo '=== 1. Admin adds an item to a section ==='
insert into public.stationery_items (section_id, name, description, unit_price, display_order)
select id, 'Sharpener', 'Metal double-hole sharpener', 350, 7
  from public.sections where slug = 'primary'
returning name, unit_price, is_active;

\echo '=== 2. Duplicate name within the same section is rejected ==='
do $t$
begin
  insert into public.stationery_items (section_id, name, unit_price)
  select id, 'Sharpener', 400 from public.sections where slug = 'primary';
  raise exception 'FAIL: duplicate name accepted';
exception when unique_violation then
  raise notice 'PASS: duplicate name rejected within a section';
end $t$;

\echo '=== 3. The same name is allowed in a different section ==='
insert into public.stationery_items (section_id, name, unit_price)
select id, 'Sharpener', 400 from public.sections where slug = 'nursery';
select count(*) as sharpeners_across_sections
  from public.stationery_items where name = 'Sharpener';

\echo '=== 4. Admin edits an item ==='
update public.stationery_items
   set name = 'Sharpener (metal)', unit_price = 500
 where name = 'Sharpener'
   and section_id = (select id from public.sections where slug = 'primary')
returning name, unit_price;

\echo '=== 5. A teacher cannot write the catalogue ==='
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $t$
begin
  insert into public.stationery_items (section_id, name, unit_price)
  select id, 'Unauthorised Item', 1 from public.sections where slug = 'primary';
  raise exception 'FAIL: teacher wrote the catalogue';
exception when insufficient_privilege then
  raise notice 'PASS: teacher blocked from adding items';
end $t$;

\echo '=== 6. ...but can still read it ==='
select count(*) > 0 as teacher_can_read from public.stationery_items;

\echo '=== 7. Retiring an item preserves the record of who received it ==='
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

select * from public.bulk_import_students(
  (select id from public.classes where slug = 'nursery-1'),
  (select id from public.terms where is_current),
  '[{"admission_number":"CAT/001","first_name":"Ada","last_name":"Obi"}]'::jsonb);

-- Issue every active Nursery item to the student.
select count(*) as issued_initially from public.set_student_stationery(
  (select id from public.students where admission_number = 'CAT/001'),
  (select id from public.terms where is_current),
  (select jsonb_agg(jsonb_build_object('item_id', i.id, 'quantity', 1))
     from public.stationery_items i
     join public.sections s on s.id = i.section_id
    where s.slug = 'nursery' and i.is_active));

update public.stationery_items set is_active = false where name = 'Pencil Set';

-- The drawer only ever submits ACTIVE items. Re-saving it must not erase the
-- retired item the student already holds.
select count(*) as issued_after_resave from public.set_student_stationery(
  (select id from public.students where admission_number = 'CAT/001'),
  (select id from public.terms where is_current),
  (select jsonb_agg(jsonb_build_object('item_id', i.id, 'quantity', 1))
     from public.stationery_items i
     join public.sections s on s.id = i.section_id
    where s.slug = 'nursery' and i.is_active
      and i.name in ('Colouring Book', 'Drawing Book')));

do $t$
declare
  v_retired integer;
  v_deselected integer;
begin
  select count(*) into v_retired
    from public.stationery_issues si
    join public.stationery_items i on i.id = si.item_id
   where si.student_id = (select id from public.students where admission_number = 'CAT/001')
     and i.name = 'Pencil Set';

  select count(*) into v_deselected
    from public.stationery_issues si
    join public.stationery_items i on i.id = si.item_id
   where si.student_id = (select id from public.students where admission_number = 'CAT/001')
     and i.name = 'Play Mat';

  if v_retired <> 1 then
    raise exception 'FAIL: retired item history was erased by a drawer re-save';
  end if;
  if v_deselected <> 0 then
    raise exception 'FAIL: a deselected active item was not removed';
  end if;
  raise notice 'PASS: retired item kept, deselected active item removed';
end $t$;

\echo '=== 8. Retired items leave the matrix columns but stay on the student ==='
select name from public.stationery_items
 where section_id = (select id from public.sections where slug = 'nursery')
   and is_active
 order by display_order, name;

select full_name, (select count(*) from jsonb_object_keys(issued)) as items_held
  from public.class_stationery_matrix(
    (select id from public.classes where slug = 'nursery-1'),
    (select id from public.terms where is_current));

\echo '=== 9. Restoring returns it to the catalogue ==='
update public.stationery_items set is_active = true where name = 'Pencil Set';
select name, is_active from public.stationery_items where name = 'Pencil Set';

reset role;

-- ---------------------------------------------------------------------------
-- Quantities
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

\echo '=== 10. Quantities are stored per issue ==='
select i.name, si.quantity from public.set_student_stationery(
  (select id from public.students where admission_number = 'CAT/001'),
  (select id from public.terms where is_current),
  (select jsonb_agg(jsonb_build_object('item_id', i.id, 'quantity', q.qty))
     from (values ('Colouring Book', 3), ('Drawing Book', 1)) as q(nm, qty)
     join public.stationery_items i on i.name = q.nm
     join public.sections s on s.id = i.section_id and s.slug = 'nursery')
) si join public.stationery_items i on i.id = si.item_id order by i.name;

\echo '=== 11. Re-saving updates an existing quantity in place ==='
select i.name, si.quantity from public.set_student_stationery(
  (select id from public.students where admission_number = 'CAT/001'),
  (select id from public.terms where is_current),
  (select jsonb_agg(jsonb_build_object('item_id', i.id, 'quantity', q.qty))
     from (values ('Colouring Book', 7), ('Drawing Book', 1)) as q(nm, qty)
     join public.stationery_items i on i.name = q.nm
     join public.sections s on s.id = i.section_id and s.slug = 'nursery')
) si join public.stationery_items i on i.id = si.item_id order by i.name;

\echo '=== 12. Out-of-range and missing quantities are clamped, not rejected ==='
do $t$
declare
  v_zero smallint;
  v_missing smallint;
  v_huge smallint;
begin
  perform public.set_student_stationery(
    (select id from public.students where admission_number = 'CAT/001'),
    (select id from public.terms where is_current),
    jsonb_build_array(
      jsonb_build_object('item_id', (select i.id from public.stationery_items i
        join public.sections s on s.id = i.section_id
       where s.slug = 'nursery' and i.name = 'Colouring Book'), 'quantity', 0),
      -- no quantity key at all
      jsonb_build_object('item_id', (select i.id from public.stationery_items i
        join public.sections s on s.id = i.section_id
       where s.slug = 'nursery' and i.name = 'Drawing Book')),
      jsonb_build_object('item_id', (select i.id from public.stationery_items i
        join public.sections s on s.id = i.section_id
       where s.slug = 'nursery' and i.name = 'Play Mat'), 'quantity', 99999)
    ));

  select si.quantity into v_zero from public.stationery_issues si
    join public.stationery_items i on i.id = si.item_id
   where si.student_id = (select id from public.students where admission_number = 'CAT/001')
     and i.name = 'Colouring Book';

  select si.quantity into v_missing from public.stationery_issues si
    join public.stationery_items i on i.id = si.item_id
   where si.student_id = (select id from public.students where admission_number = 'CAT/001')
     and i.name = 'Drawing Book';

  select si.quantity into v_huge from public.stationery_issues si
    join public.stationery_items i on i.id = si.item_id
   where si.student_id = (select id from public.students where admission_number = 'CAT/001')
     and i.name = 'Play Mat';

  if v_zero <> 1 then raise exception 'FAIL: quantity 0 became %, expected 1', v_zero; end if;
  if v_missing <> 1 then raise exception 'FAIL: missing quantity became %, expected 1', v_missing; end if;
  if v_huge <> 999 then raise exception 'FAIL: quantity 99999 became %, expected 999', v_huge; end if;
  raise notice 'PASS: quantities clamped to 1..999';
end $t$;

\echo '=== 13. The matrix carries quantities as {item_id: qty} ==='
select full_name, issued from public.class_stationery_matrix(
  (select id from public.classes where slug = 'nursery-1'),
  (select id from public.terms where is_current));

reset role;
