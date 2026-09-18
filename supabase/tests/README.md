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
psql -h /tmp -p 55432 -U postgres -f supabase/tests/03_stationery_catalogue.sql
psql -h /tmp -p 55432 -U postgres -f supabase/tests/04_family_payments.sql
```

`01_business_logic.sql` covers the bulk importer, the dual ledger, part payments
and the receipt sequence, overpayment rejection, payment voiding, the stationery
select-all / partial-selection paths, cross-section rejection, the class matrix
RPC, class promotion with arrears roll-over, duplicate-promotion rejection,
graduation from the terminal class, and archive / restore.

`02_row_level_security.sql` asserts the role boundaries: a teacher may read the
roster and issue stationery but may not create students or take payments; a
bursar may take payments but may not run promotions.

`03_stationery_catalogue.sql` covers catalogue management: adding and editing
items, names being unique across the whole catalogue (case-insensitively),
teachers being read-only over the catalogue, and — most importantly — that
retiring an item removes it from the matrix without erasing the record of
students who already received it, even after their drawer is re-saved. It also covers per-issue quantities: they are stored and updated in
place, and values that are zero, missing or absurd are clamped to 1..999 rather
than raising a constraint violation.

`04_family_payments.sql` covers siblings paying together: grouping pupils into a
household, the combined outstanding across classes, a part payment splitting
into one numbered slip per child under a single family receipt, and the snapshot
the parent is shown. It also asserts the refusals — overpaying one child fails
the whole handover with every ledger untouched, a pupil from another household
cannot be paid for through this family, an archived child drops out of the
family total, and a teacher may read families but never take money.

Every `PASS:` notice is an assertion that held. Any `FAIL:` line, or any error
other than the ones the scripts deliberately provoke, is a regression.
