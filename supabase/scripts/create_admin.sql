-- =============================================================================
-- Create (or repair) an administrator account
-- =============================================================================
-- Run this in the Supabase SQL editor AFTER applying supabase/migrations/*.
--
-- Replace these three values everywhere they appear below:
--   'admin@example.com'          -> the sign-in email (keep it lowercase)
--   'CHANGE-ME'                  -> the password
--   'Administrator'              -> the display name
--
-- Deliberately written as five plain statements with no DO block and no
-- dollar-quoted body: some SQL clients split on semicolons or mangle `$$`,
-- which breaks a procedural version before it ever reaches Postgres. These can
-- also be run one at a time.
--
-- Safe to re-run: an existing account with the same email is updated in place
-- (password reset, admin role restored) rather than duplicated.
--
-- DO NOT COMMIT this file with a real password in it.
-- =============================================================================

-- 0. crypt()/gen_salt() come from pgcrypto, which Supabase enables by default.
--    This is a no-op on an existing project.
create extension if not exists pgcrypto;

-- 1. Create the account if it does not already exist.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@example.com',
  crypt('CHANGE-ME', gen_salt('bf')),
  now(),                                     -- pre-confirmed: no verification email
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Administrator","role":"admin"}'::jsonb,
  now(), now(),
  -- GoTrue decodes these as strings. Leaving them NULL causes
  -- "converting NULL to string is unsupported" on later auth flows.
  '', '', '', ''
where not exists (
  select 1 from auth.users where lower(email) = 'admin@example.com'
);

-- 2. Set the password and metadata. Also repairs an account that already existed.
update auth.users
   set encrypted_password = crypt('CHANGE-ME', gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || '{"full_name":"Administrator","role":"admin"}'::jsonb,
       updated_at = now()
 where lower(email) = 'admin@example.com';

-- 3. Email/password sign-in fails without a matching identity row, even though
--    the user exists.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', lower(u.email),
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
  from auth.users u
 where lower(u.email) = 'admin@example.com'
on conflict (provider_id, provider) do nothing;

-- 4. Give the account an admin profile in the application.
insert into public.profiles (id, full_name, email, role)
select u.id, 'Administrator', lower(u.email), 'admin'
  from auth.users u
 where lower(u.email) = 'admin@example.com'
on conflict (id) do update
  set role = 'admin',
      full_name = excluded.full_name,
      email = excluded.email;

-- 5. Confirm the result.
select u.id,
       u.email,
       u.email_confirmed_at is not null as email_confirmed,
       p.full_name,
       p.role
  from auth.users u
  join public.profiles p on p.id = u.id
 where p.role = 'admin';
