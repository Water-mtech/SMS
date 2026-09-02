# Database tests

These scripts exercise the migrations against a plain PostgreSQL 16 instance —
no Supabase installation required. `00_supabase_stub.sql` supplies the small
slice of Supabase the migrations depend on (`auth.users`, `auth.uid()`, and the
`anon` / `authenticated` / `service_role` roles).

```bash
initdb -D /tmp/pgdata -U postgres --auth=trust
pg_ctl -D /tmp/pgdata -o "-k /tmp -p 55432 -c listen_addresses=" -l /tmp/pgdata/log start

psql -h /tmp -p 55432 -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  psql -h /tmp -p 55432 -U postgres -v ON_ERROR_STOP=1 -f "$f"
done
psql -h /tmp -p 55432 -U postgres -c "
  grant usage on schema auth, public to authenticated, anon, service_role;
  grant select on auth.users to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;"

psql -h /tmp -p 55432 -U postgres -f supabase/tests/01_business_logic.sql
psql -h /tmp -p 55432 -U postgres -f supabase/tests/02_row_level_security.sql
```

`01_business_logic.sql` covers the bulk importer, the dual ledger, part payments
and the receipt sequence, overpayment rejection, payment voiding, the stationery
select-all / partial-selection paths, cross-section rejection, the class matrix
RPC, class promotion with arrears roll-over, duplicate-promotion rejection,
graduation from the terminal class, and archive / restore.

`02_row_level_security.sql` asserts the role boundaries: a teacher may read the
roster and issue stationery but may not create students or take payments; a
bursar may take payments but may not run promotions.

Every `PASS:` notice is an assertion that held. Any `FAIL:` line, or any error
other than the ones the scripts deliberately provoke, is a regression.
