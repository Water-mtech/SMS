// Runs every test file in sequence and fails the run if any of them fails.
import { spawnSync } from 'node:child_process';

const files = [
  'src/lib/__tests__/retry-fetch.test.mjs',
  'src/lib/__tests__/query-error.test.mjs',
  'src/lib/__tests__/quantity.test.mjs',
  'src/lib/__tests__/roster-classes.test.mjs',
  'src/lib/__tests__/overlay-focus.test.tsx',
];

let failed = 0;
for (const file of files) {
  console.log(`\n── ${file}`);
  const result = spawnSync(
    'npx',
    ['tsx', '--tsconfig', 'tsconfig.test.json', file],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) failed += 1;
}

console.log(failed === 0 ? '\nAll test files passed.' : `\n${failed} test file(s) failed.`);
process.exit(failed > 0 ? 1 : 0);
