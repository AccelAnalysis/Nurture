import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every Firebase/runtime environment flag is documented in an example file', async () => {
  const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  const [runtime, firebase, example, demo, guide] = await Promise.all([
    read('src/config/runtime.ts'),
    read('src/firebase.ts'),
    read('.env.example'),
    read('.env.demo'),
    read('README.md'),
  ]);
  const declared = new Set(
    [...`${example}\n${demo}`.matchAll(/^(VITE_[A-Z_]+)=/gm)].map((match) => match[1]),
  );
  for (const match of `${runtime}\n${firebase}`.matchAll(/import\.meta\.env\.(VITE_[A-Z_]+)/g))
    assert.ok(declared.has(match[1]), `${match[1]} must be included in an example environment`);
  assert.match(example, /^VITE_USE_EMULATORS=false$/m);
  assert.match(guide, /VITE_USE_EMULATORS=true/);
  assert.match(example, /^VITE_FIREBASE_PROJECT_ID=nurture-12398$/m);
});
