-- =============================================================================
-- One shared stationery catalogue
-- =============================================================================
-- Items were scoped to a section, so a class only ever saw its own section's
-- list. In practice the school keeps one list and ticks whatever applies to a
-- given child, so section_id goes away and every item is offered to every
-- student.
--
-- The seed shipped three names in two sections each ("Mathematical Set",
-- "Scientific Calculator", "Subject Notebooks"), which a global unique name
-- would reject. Duplicates are merged rather than dropped: issue records are
-- repointed onto the surviving row first, so no record of who received what is
-- lost.
-- =============================================================================

-- 1. Repoint issues from duplicate names onto the keeper for that name.
--    The keeper is the oldest active row, so a retired duplicate never wins.
with ranked as (
  select
    id,
    row_number() over w as rn,
    first_value(id) over w as keeper_id
  from public.stationery_items
  window w as (
    partition by lower(btrim(name))
    order by is_active desc, created_at, id
  )
)
update public.stationery_issues si
   set item_id = r.keeper_id
  from ranked r
 where si.item_id = r.id
   and r.rn > 1
   -- Skip where the student already holds the keeper; the unique constraint on
   -- (student, item, term) would reject the move. Those rows are removed next.
   and not exists (
     select 1 from public.stationery_issues existing
      where existing.student_id = si.student_id
        and existing.term_id = si.term_id
        and existing.item_id = r.keeper_id
   );

-- 2. Drop the issue rows that could not be repointed: the student already holds
--    the keeper, so the information is preserved on that row.
with ranked as (
  select id, row_number() over w as rn
  from public.stationery_items
  window w as (
    partition by lower(btrim(name))
    order by is_active desc, created_at, id
  )
)
delete from public.stationery_issues si
 using ranked r
 where si.item_id = r.id and r.rn > 1;

-- 3. Remove the now-unreferenced duplicate items.
with ranked as (
  select id, row_number() over w as rn
  from public.stationery_items
  window w as (
    partition by lower(btrim(name))
    order by is_active desc, created_at, id
  )
)
delete from public.stationery_items i
 using ranked r
 where i.id = r.id and r.rn > 1;

-- 4. Unscope the catalogue. Dropping the column takes its unique constraint and
--    index with it.
alter table public.stationery_items drop column if exists section_id;

-- Case-insensitive so "Ruler" and "ruler" cannot both be added.
create unique index if not exists stationery_items_name_key
  on public.stationery_items (lower(btrim(name)));

create index if not exists stationery_items_order_idx
  on public.stationery_items (display_order, name) where is_active;

-- 5. The section check in set_student_stationery no longer has a section to
--    check against; an item only has to exist and be active.
create or replace function public.set_student_stationery(
  p_student_id uuid,
  p_term_id uuid,
  p_items jsonb
)
returns setof public.stationery_issues
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_student_exists boolean;
  v_invalid_count integer;
begin
  -- Serialise concurrent edits for this student/term. A transaction-level
  -- advisory lock is used rather than `SELECT ... FOR UPDATE` on students,
  -- because row locking additionally requires an UPDATE policy on that table --
  -- which teachers, who legitimately issue stationery, do not have.
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || p_term_id::text, 0));

  select true
    into v_student_exists
    from public.students s
   where s.id = p_student_id
     and s.archived_at is null;

  if v_student_exists is null then
    raise exception 'Student % not found or archived', p_student_id
      using errcode = 'no_data_found';
  end if;

  -- Every requested item must exist and still be active.
  select count(*)
    into v_invalid_count
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as element
    left join public.stationery_items i
      on i.id = (element ->> 'item_id')::uuid
     and i.is_active
   where i.id is null;

  if v_invalid_count > 0 then
    raise exception 'Request contains % unknown or retired stationery item(s)', v_invalid_count
      using errcode = 'check_violation';
  end if;

  -- Only active items are under the drawer's control. Rows for retired items
  -- are left alone, so retiring an item never rewrites history.
  delete from public.stationery_issues si
   using public.stationery_items i
   where si.item_id = i.id
     and si.student_id = p_student_id
     and si.term_id = p_term_id
     and i.is_active
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as element
        where (element ->> 'item_id')::uuid = si.item_id
     );

  insert into public.stationery_issues (student_id, item_id, term_id, quantity, issued_by)
  select
    p_student_id,
    (element ->> 'item_id')::uuid,
    p_term_id,
    least(greatest(coalesce((element ->> 'quantity')::integer, 1), 1), 999)::smallint,
    v_actor
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as element
  on conflict (student_id, item_id, term_id) do update
    set quantity = excluded.quantity;

  return query
    select * from public.stationery_issues si
     where si.student_id = p_student_id and si.term_id = p_term_id;
end;
$fn$;

-- 6. Dropping a column changes the shape PostgREST exposes. Supabase normally
--    reloads its schema cache from a DDL event trigger; this makes it explicit
--    so the catalogue cannot be served from a cache that still expects
--    section_id.
notify pgrst, 'reload schema';
