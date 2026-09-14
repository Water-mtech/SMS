-- =============================================================================
-- Per-issue quantities
-- =============================================================================
-- stationery_issues has always carried a `quantity` column, but the drawer had
-- no way to set it: it sent a bare array of item ids and every row landed on the
-- default of 1. These two functions now speak in {item_id, quantity} pairs so a
-- clerk can record "3 exercise books" at the moment they tick the item.
--
-- Both signatures change, so each function is dropped and recreated rather than
-- replaced -- a plain CREATE OR REPLACE would leave the old overload in place
-- and PostgREST could still resolve to it.
-- =============================================================================

drop function if exists public.set_student_stationery(uuid, uuid, uuid[]);

create function public.set_student_stationery(
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

  -- Quantities are clamped rather than rejected: the UI already bounds the
  -- input, and a stray 0 should mean "one", never a constraint violation.
  -- The payload is parsed inline at each step; it is a handful of rows, and a
  -- temporary table would add catalog churn on every call under pooling.

  -- Every requested item must belong to the student's own section.
  select count(*)
    into v_invalid_count
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as element
    left join public.stationery_items i
      on i.id = (element ->> 'item_id')::uuid
     and i.section_id = v_section_id
     and i.is_active
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

-- The matrix now carries quantities so a cell can render "check x3" without a
-- second round trip.
drop function if exists public.class_stationery_matrix(uuid, uuid);

create function public.class_stationery_matrix(
  p_class_id uuid,
  p_term_id uuid
)
returns table (
  student_id uuid,
  admission_number text,
  full_name text,
  -- {"<item_id>": quantity, ...}
  issued jsonb
)
language sql
stable
security invoker
set search_path = public
as $fn$
  select
    s.id,
    s.admission_number,
    public.student_full_name(s),
    coalesce(
      jsonb_object_agg(si.item_id, si.quantity) filter (where si.item_id is not null),
      '{}'::jsonb
    )
  from public.students s
  left join public.stationery_issues si
    on si.student_id = s.id and si.term_id = p_term_id
  where s.class_id = p_class_id
    and s.archived_at is null
    and s.status = 'active'
  group by s.id
  order by s.last_name, s.first_name;
$fn$;
