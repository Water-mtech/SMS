-- =============================================================================
-- Preserve issue history for retired stationery items
-- =============================================================================
-- The student drawer only ever lists ACTIVE items, so the set it submits can
-- only speak for those. The original implementation deleted every issue row not
-- present in that set, which silently erased the record of a retired item the
-- student had already received the moment anyone re-saved their drawer.
--
-- Scoping the delete to active items makes retirement mean what the UI says it
-- means: the item leaves the matrix, the history of who received it stays.
-- =============================================================================

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

  -- Only active items are under the drawer's control. Rows for retired items
  -- are left alone, so retiring an item never rewrites history.
  delete from public.stationery_issues si
   using public.stationery_items i
   where si.item_id = i.id
     and si.student_id = p_student_id
     and si.term_id = p_term_id
     and i.is_active
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

-- The matrix must show a retired item a student still holds, otherwise the
-- drawer and the grid would disagree about what that student has received.
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
