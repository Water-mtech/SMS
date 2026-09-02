-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Reference data (sections, classes, terms, items, structures) is readable by
-- any signed-in staff member and writable by admins.
-- Operational data (students, issues, ledgers, payments) is readable by staff;
-- fee writes are restricted to admins and bursars.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.sections            enable row level security;
alter table public.classes             enable row level security;
alter table public.academic_sessions   enable row level security;
alter table public.terms               enable row level security;
alter table public.students            enable row level security;
alter table public.stationery_items    enable row level security;
alter table public.stationery_issues   enable row level security;
alter table public.fee_structures      enable row level security;
alter table public.fee_accounts        enable row level security;
alter table public.fee_payments        enable row level security;
alter table public.promotion_batches   enable row level security;
alter table public.promotion_records   enable row level security;

-- Profiles ---------------------------------------------------------------
create policy "profiles are readable by staff"
  on public.profiles for select to authenticated using (true);

create policy "users maintain their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "admins manage profiles"
  on public.profiles for all to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

-- Reference data ---------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sections', 'classes', 'academic_sessions', 'terms', 'stationery_items'
  ]
  loop
    execute format(
      'create policy "staff read %1$s" on public.%1$I for select to authenticated using (true)', t
    );
    execute format(
      'create policy "admins write %1$s" on public.%1$I for all to authenticated '
      'using (public.has_role(array[''admin'']::public.app_role[])) '
      'with check (public.has_role(array[''admin'']::public.app_role[]))', t
    );
  end loop;
end;
$$;

-- Students ---------------------------------------------------------------
create policy "staff read students"
  on public.students for select to authenticated using (true);

create policy "admins manage students"
  on public.students for all to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

-- Stationery issues: any staff member may record what a child has received.
create policy "staff read stationery issues"
  on public.stationery_issues for select to authenticated using (true);

create policy "staff manage stationery issues"
  on public.stationery_issues for all to authenticated
  using (public.has_role(array['admin', 'bursar', 'teacher']::public.app_role[]))
  with check (public.has_role(array['admin', 'bursar', 'teacher']::public.app_role[]));

-- Fees -------------------------------------------------------------------
create policy "staff read fee structures"
  on public.fee_structures for select to authenticated using (true);

create policy "finance staff manage fee structures"
  on public.fee_structures for all to authenticated
  using (public.has_role(array['admin', 'bursar']::public.app_role[]))
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

create policy "staff read fee accounts"
  on public.fee_accounts for select to authenticated using (true);

create policy "finance staff manage fee accounts"
  on public.fee_accounts for all to authenticated
  using (public.has_role(array['admin', 'bursar']::public.app_role[]))
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

create policy "staff read fee payments"
  on public.fee_payments for select to authenticated using (true);

create policy "finance staff record payments"
  on public.fee_payments for insert to authenticated
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

-- Payments are never edited in place; they are voided, which writes an audit trail.
create policy "finance staff void payments"
  on public.fee_payments for update to authenticated
  using (public.has_role(array['admin', 'bursar']::public.app_role[]))
  with check (public.has_role(array['admin', 'bursar']::public.app_role[]));

-- Promotions -------------------------------------------------------------
create policy "staff read promotion batches"
  on public.promotion_batches for select to authenticated using (true);

create policy "admins run promotions"
  on public.promotion_batches for all to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff read promotion records"
  on public.promotion_records for select to authenticated using (true);

create policy "admins write promotion records"
  on public.promotion_records for all to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

-- -----------------------------------------------------------------------------
-- New auth users get a staff profile automatically.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'teacher')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
