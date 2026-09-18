// Run with: npx tsx src/lib/__tests__/query-error.test.mjs
//
// The family page once failed with nothing but "Something went wrong" because
// the ledger table had not been migrated in. These assertions pin the wording a
// failure is reported with, so that never costs an afternoon again.
import assert from 'node:assert/strict';
import { describeQueryError, isMissingSchema, MIGRATION_HINT } from '../query-error.ts';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

// --- what the diagnosis is made of ------------------------------------------
check('every part of a PostgrestError reaches the message', () => {
  const described = describeQueryError({
    message: 'permission denied for table families',
    code: '42501',
    details: 'only admins may read this',
    hint: 'check the policy',
  });
  assert.match(described, /permission denied for table families/);
  assert.match(described, /code 42501/);
  assert.match(described, /only admins may read this/);
  assert.match(described, /check the policy/);
});

check('a missing error object still describes itself', () => {
  assert.equal(describeQueryError(null), 'unknown error');
});

// --- the unapplied migration ------------------------------------------------
// Verbatim from PostgREST 12 with the ledger table renamed away, and from the
// newer schema-cache 404 Supabase returns for the same thing.
const MISSING_TABLE_POSTGRES = {
  message: 'relation "public.family_fee_accounts" does not exist',
  code: '42P01',
  details: null,
  hint: null,
};

const MISSING_TABLE_SCHEMA_CACHE = {
  message: "Could not find the table 'public.family_fee_accounts' in the schema cache",
  code: 'PGRST205',
  details: null,
  hint: null,
};

check('a missing table is reported as a migration to apply', () => {
  for (const error of [MISSING_TABLE_POSTGRES, MISSING_TABLE_SCHEMA_CACHE]) {
    assert.ok(isMissingSchema(error), `${error.code} should read as a missing object`);
    const described = describeQueryError(error);
    assert.match(described, /family_fee_accounts/, 'the object must still be named');
    assert.ok(described.includes(MIGRATION_HINT), 'the remedy must be spelled out');
  }
});

check('a missing column, function or relationship says the same thing', () => {
  for (const code of ['42703', '42883', 'PGRST200', 'PGRST202', 'PGRST204']) {
    assert.ok(isMissingSchema({ message: 'nope', code }), `${code} should read as a missing object`);
  }
});

check('an ordinary failure is not blamed on a migration', () => {
  for (const code of ['42501', '23505', 'PGRST116', '22P02']) {
    const error = { message: 'nope', code };
    assert.equal(isMissingSchema(error), false, `${code} is not a schema problem`);
    assert.ok(!describeQueryError(error).includes(MIGRATION_HINT));
  }
});

check('an error with no message still says something', () => {
  // supabase-js returns a bare {} when the response was not the JSON it
  // expected, and a context line ending in ": " helps nobody.
  assert.equal(describeQueryError({}), 'unknown error');
  assert.equal(describeQueryError({ code: '42P01' }), 'unknown error (code 42P01)');
});

check('an error with no code at all is left alone', () => {
  const described = describeQueryError({ message: 'fetch failed' });
  assert.equal(described, 'fetch failed');
});

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
