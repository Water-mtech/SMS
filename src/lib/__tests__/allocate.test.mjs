// Run with: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/allocate.test.mjs
import assert from 'node:assert/strict';
import {
  suggestAllocation,
  allocationTotal,
  validateAllocation,
  roundKobo,
} from '../fees/allocate.ts';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

// The worked example from the design: Musa 80,000, Aisha 60,000, Khalid 40,000.
const FAMILY = [
  { studentId: 'musa', balance: 80000 },
  { studentId: 'aisha', balance: 60000 },
  { studentId: 'khalid', balance: 40000 },
];
const NAMES = { musa: 'Musa', aisha: 'Aisha', khalid: 'Khalid' };
const nameOf = (id) => NAMES[id] ?? id;

check('a part payment clears the largest debt first', () => {
  assert.deepEqual(suggestAllocation(FAMILY, 50000), { musa: 50000 });
});

check('money spills into the next child once the first is cleared', () => {
  assert.deepEqual(suggestAllocation(FAMILY, 100000), { musa: 80000, aisha: 20000 });
});

check('paying the whole family debt clears every child exactly', () => {
  const split = suggestAllocation(FAMILY, 180000);
  assert.deepEqual(split, { musa: 80000, aisha: 60000, khalid: 40000 });
  assert.equal(allocationTotal(split), 180000);
});

check('no child is ever allocated more than they owe', () => {
  // More money than the household owes: the surplus is simply not allocated.
  const split = suggestAllocation(FAMILY, 500000);
  assert.equal(allocationTotal(split), 180000, 'only the real debt is allocated');
  for (const target of FAMILY) {
    assert.ok((split[target.studentId] ?? 0) <= target.balance, `${target.studentId} overpaid`);
  }
});

check('a child who owes nothing is left out of the suggestion', () => {
  const split = suggestAllocation([...FAMILY, { studentId: 'cleared', balance: 0 }], 50000);
  assert.equal(split.cleared, undefined);
});

check('zero and negative amounts allocate nothing', () => {
  assert.deepEqual(suggestAllocation(FAMILY, 0), {});
  assert.deepEqual(suggestAllocation(FAMILY, -5000), {});
});

check('the same input always proposes the same split', () => {
  // Equal balances must not reorder between renders, or the boxes would jump.
  const tied = [
    { studentId: 'b', balance: 50000 },
    { studentId: 'a', balance: 50000 },
  ];
  assert.deepEqual(suggestAllocation(tied, 50000), suggestAllocation(tied, 50000));
  assert.deepEqual(suggestAllocation(tied, 50000), { a: 50000 });
});

check('kobo amounts do not drift', () => {
  const split = suggestAllocation(
    [
      { studentId: 'a', balance: 1000.1 },
      { studentId: 'b', balance: 2000.2 },
    ],
    3000.3,
  );
  assert.equal(allocationTotal(split), 3000.3);
  assert.equal(roundKobo(0.1 + 0.2), 0.3);
});

// --- validation -------------------------------------------------------------
check('an override above a child balance is caught by name', () => {
  const problems = validateAllocation(FAMILY, { khalid: 41000 }, nameOf);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].studentId, 'khalid');
  assert.match(problems[0].message, /Khalid owes only/);
});

check('a valid override passes', () => {
  assert.deepEqual(validateAllocation(FAMILY, { aisha: 60000, musa: 1 }, nameOf), []);
});

check('blank and zero lines are not errors', () => {
  assert.deepEqual(validateAllocation(FAMILY, { musa: 0 }, nameOf), []);
  assert.deepEqual(validateAllocation(FAMILY, {}, nameOf), []);
});

check('a negative override is rejected', () => {
  const problems = validateAllocation(FAMILY, { musa: -100 }, nameOf);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /valid amount/);
});

check('paying a child exactly to zero is allowed', () => {
  assert.deepEqual(validateAllocation(FAMILY, { musa: 80000 }, nameOf), []);
});

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failures = results.filter(([status]) => status !== 'PASS').length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
