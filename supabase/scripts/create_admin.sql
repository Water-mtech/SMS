-- =============================================================================
-- Create (or repair) an administrator account
-- =============================================================================
-- Edit the three variables below, then run this in the Supabase SQL editor.
-- Apply supabase/migrations/* first — this script writes to public.profiles.
--
-- Re-running it is safe: an existing account with the same email is updated in
-- place (password reset, role restored to admin) rather than duplicated.
--
-- DO NOT COMMIT this file with a real password filled in. Prefer the Supabase
-- dashboard (Authentication -> Users -> Add user) where you can, and use this
-- script for seeding a fresh project or recovering a locked-out admin.
-- =============================================================================

do $$
declare
  v_email    text := 'CHANGE-ME@example.com';
  v_password text := 'CHANGE-ME';
  v_name     text := 'CHANGE ME';
  v_user_id  uuid;
begin
  -- pgcrypto supplies crypt()/gen_salt(). Supabase installs it into the
  -- extensions schema; this covers a project where it is not yet enabled.
  if to_regprocedure('public.crypt(text, text)') is null
     and to_regprocedure('extensions.crypt(text, text)') is null then
    create extension if not exists pgcrypto with schema extensions;
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(v_email);

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_email),
      crypt(v_password, gen_salt('bf')),
      now(),                                   -- pre-confirmed: no verification email
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name, 'role', 'admin'),
      now(), now(),
      -- GoTrue reads these as strings. Leaving them NULL causes
      -- "converting NULL to string is unsupported" on later auth flows.
      '', '', '', ''
    );

    -- Without a matching identity row, email/password sign-in fails even though
    -- the user exists.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', lower(v_email),
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;

    raise notice 'Created auth user % (%)', v_email, v_user_id;
  else
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                  || jsonb_build_object('full_name', v_name, 'role', 'admin'),
           updated_at = now()
     where id = v_user_id;

    raise notice 'Updated existing auth user % (%)', v_email, v_user_id;
  end if;

  -- The on_auth_user_created trigger creates the profile for new users; this
  -- upsert covers the update path and guarantees the admin role either way.
  insert into public.profiles (id, full_name, email, role)
  values (v_user_id, v_name, lower(v_email), 'admin')
  on conflict (id) do update
    set role = 'admin',
        full_name = excluded.full_name,
        email = excluded.email;
end;
$$;

-- Confirm the result.
select u.id,
       u.email,
       u.email_confirmed_at is not null as email_confirmed,
       p.full_name,
       p.role
  from auth.users u
  join public.profiles p on p.id = u.id
 where p.role = 'admin';
