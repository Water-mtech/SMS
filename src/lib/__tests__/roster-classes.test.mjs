// Run with: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/roster-classes.test.mjs
import assert from 'node:assert/strict';
import { classKey, classIndex, matchClass } from '../roster/class-match.ts';
import { groupRowsByClass } from '../roster/grouping.ts';
import { normaliseRecords } from '../roster/import.ts';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

// The classes as seeded by 20250101000003_seed.sql.
const CLASSES = [
  'Pre-Nursery',
  'Nursery 1',
  'Nursery 2',
  'Nursery 3',
  'Primary 1',
  'Primary 2',
  'Primary 3',
  'Primary 4',
  'Primary 5',
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SS 1',
  'SS 2',
  'SS 3',
].map((name, index) => ({ id: `id-${index}`, name }));

const INDEX = classIndex(CLASSES);

// --- label matching ---------------------------------------------------------
check('a label matches the class it names exactly', () => {
  assert.equal(matchClass('Primary 3', INDEX)?.name, 'Primary 3');
  assert.equal(matchClass('JSS 1', INDEX)?.name, 'JSS 1');
});

check('spacing, case and punctuation do not matter', () => {
  for (const label of ['PRE- NURSERY', 'pre nursery', 'Pre-Nursery', 'prenursery']) {
    assert.equal(matchClass(label, INDEX)?.name, 'Pre-Nursery', `failed on ${label}`);
  }
});

check('SSS1 in the school roster reaches the seeded SS 1', () => {
  // The exact spelling in the academy's own list.
  assert.equal(matchClass('SSS1', INDEX)?.name, 'SS 1');
  assert.equal(matchClass('SS 1', INDEX)?.name, 'SS 1');
  assert.equal(matchClass('Senior Secondary 1', INDEX)?.name, 'SS 1');
});

check('common shorthands resolve', () => {
  assert.equal(matchClass('Pry 4', INDEX)?.name, 'Primary 4');
  assert.equal(matchClass('NUR 2', INDEX)?.name, 'Nursery 2');
  assert.equal(matchClass('JS3', INDEX)?.name, 'JSS 3');
});

check('an unknown class does not match anything', () => {
  // The Islamiyya streams the import is asked to leave out.
  for (const label of ['FASLIL AUWAL', "Faslu sabi'u", 'Faslil Sadis', 'FASLIL-KHAMIS']) {
    assert.equal(matchClass(label, INDEX), null, `${label} must not match`);
  }
  assert.equal(matchClass('', INDEX), null);
  assert.equal(matchClass('   ', INDEX), null);
});

check('a year number is never dropped', () => {
  assert.notEqual(classKey('Primary 1'), classKey('Primary 2'));
  assert.equal(matchClass('Primary 1', INDEX)?.name, 'Primary 1');
  assert.notEqual(matchClass('Nursery 1', INDEX)?.id, matchClass('Nursery 3', INDEX)?.id);
});

// --- grouping ---------------------------------------------------------------
const rowsOf = (...pairs) =>
  pairs.map(([admission, className], index) => ({
    admission_number: admission,
    first_name: 'A',
    last_name: 'B',
    class_name: className,
    line: index + 2,
  }));

check('rows are split into one batch per class', () => {
  const { groups, unmatched } = groupRowsByClass(
    rowsOf(['1', 'Primary 1'], ['2', 'JSS 2'], ['3', 'Primary 1']),
    CLASSES,
    null,
  );
  assert.equal(unmatched.length, 0);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.target.name, group.rows.length]),
    [
      ['Primary 1', 2],
      ['JSS 2', 1],
    ],
    'groups follow the configured class order, not row order',
  );
});

check('a row with no class of its own uses the class picked on screen', () => {
  const fallback = CLASSES.find((item) => item.name === 'Nursery 2');
  const { groups, unmatched } = groupRowsByClass(rowsOf(['1', ''], ['2', null]), CLASSES, fallback);
  assert.equal(unmatched.length, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].target.name, 'Nursery 2');
  assert.equal(groups[0].rows.length, 2);
});

check('an unknown class is rejected, never filed under the fallback', () => {
  const fallback = CLASSES.find((item) => item.name === 'Primary 1');
  const { groups, unmatched } = groupRowsByClass(
    rowsOf(['1', 'FASLIL AUWAL'], ['2', 'Primary 1']),
    CLASSES,
    fallback,
  );
  assert.equal(groups.length, 1, 'only the real class is imported');
  assert.equal(groups[0].rows.length, 1);
  assert.equal(groups[0].rows[0].admission_number, '2');
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].line, 2);
  assert.match(unmatched[0].message, /FASLIL AUWAL/);
});

check('a row with no class and no fallback is rejected, not guessed', () => {
  const { groups, unmatched } = groupRowsByClass(rowsOf(['1', '']), CLASSES, null);
  assert.equal(groups.length, 0);
  assert.equal(unmatched.length, 1);
});

// --- end to end over the real file shape ------------------------------------
check('a CSV with a class column routes every row to its own class', () => {
  const parsed = normaliseRecords([
    { admission_number: '0083', first_name: 'Abubakar', last_name: 'Muhammad Sadik', class: 'JSS 1' },
    { admission_number: '20230110', first_name: 'Abdulrahman', last_name: 'Isiaka', class: 'SSS1' },
    { admission_number: '1147/1255518', first_name: 'Abubakar', last_name: 'Kabir', class: 'PRE- NURSERY' },
  ]);
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.equal(parsed.rows.length, 3);

  const { groups, unmatched } = groupRowsByClass(parsed.rows, CLASSES, null);
  assert.equal(unmatched.length, 0);
  assert.deepEqual(groups.map((group) => group.target.name), ['Pre-Nursery', 'JSS 1', 'SS 1']);
});

check('the same admission number twice in one file is rejected once', () => {
  const parsed = normaliseRecords([
    { admission_number: '0083', first_name: 'A', last_name: 'B', class: 'JSS 1' },
    { admission_number: '0083', first_name: 'C', last_name: 'D', class: 'JSS 2' },
  ]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0].message, /Duplicate admission number/);
});

check('every row keeps the spreadsheet line it came from', () => {
  const parsed = normaliseRecords([
    { admission_number: '1', first_name: 'A', last_name: 'B' },
    { admission_number: '2', first_name: 'C', last_name: 'D' },
  ]);
  assert.deepEqual(parsed.rows.map((row) => row.line), [2, 3]);
});

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failures = results.filter(([status]) => status !== 'PASS').length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
