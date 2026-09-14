// Run with: npx tsx src/lib/__tests__/quantity.test.mjs
import assert from 'node:assert/strict';
import { sanitiseQuantityInput, commitQuantity } from '../quantity.ts';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

// --- the reported bug -------------------------------------------------------
check('the box can be cleared completely while typing', () => {
  assert.equal(
    sanitiseQuantityInput(''),
    '',
    'clearing must leave the field empty, not snap back to 1',
  );
});

check('clear-then-retype reaches the intended number', () => {
  // What a clerk actually does: select-none, backspace, type 5.
  let value = '1';
  value = sanitiseQuantityInput('');       // backspace
  assert.equal(value, '');
  value = sanitiseQuantityInput(value + '5');
  assert.equal(value, '5');
  assert.equal(commitQuantity(value), 5);
});

check('typing extra digits builds a multi-digit number', () => {
  assert.equal(sanitiseQuantityInput('12'), '12');
  assert.equal(sanitiseQuantityInput('123'), '123');
});

// --- input hygiene ----------------------------------------------------------
check('non-digits are dropped', () => {
  assert.equal(sanitiseQuantityInput('1a2'), '12');
  assert.equal(sanitiseQuantityInput('-3'), '3');
  assert.equal(sanitiseQuantityInput('2.5'), '25');
  assert.equal(sanitiseQuantityInput('e'), '');
});

check('leading zeros collapse but a lone zero survives typing', () => {
  assert.equal(sanitiseQuantityInput('007'), '7');
  assert.equal(sanitiseQuantityInput('0'), '0', 'a lone 0 is allowed mid-typing');
});

check('length is capped so the smallint column cannot overflow', () => {
  assert.equal(sanitiseQuantityInput('99999'), '999');
});

// --- committing -------------------------------------------------------------
check('an empty box commits as 1', () => {
  assert.equal(commitQuantity(''), 1);
});

check('zero commits as 1 rather than violating the check constraint', () => {
  assert.equal(commitQuantity('0'), 1);
});

check('values are clamped to 1..999', () => {
  assert.equal(commitQuantity('1'), 1);
  assert.equal(commitQuantity('500'), 500);
  assert.equal(commitQuantity('999'), 999);
  assert.equal(commitQuantity('4000'), 999);
});

check('junk commits as 1', () => {
  assert.equal(commitQuantity('abc'), 1);
});

let failed = 0;
for (const [status, name] of results) {
  if (status === 'FAIL') failed += 1;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
