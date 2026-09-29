import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const [title, valid] of [
  ['fix(cli): handle missing snapshots', true],
  ['feat(differs.core)!: classify constraints', true],
  ['fix(differs.json-schema): validate schema', true],
  ['fix(differs.openapi): validate schema', true],
  ['test(changesets): preserve changesets', true],
  ['fix(governance): check schema origins', true],
  ['feat(types): expose options', true],
  ['fix(*): update dependencies', true],
  ['ci: verify builds', true],
  ['fix(diff): invalid package scope', false],
  ['fix(release): invalid package scope', false],
  ['update dependencies', false],
  ['fix(cli): ', false],
  ['fix(cli): title\ninjected body', false],
]) {
  test(title, () => {
    const result = spawnSync(process.execPath, [new URL('./check-pr-title.mjs', import.meta.url).pathname], {
      env: { ...process.env, PR_TITLE: title },
      encoding: 'utf8',
    });
    assert.equal(result.status, valid ? 0 : 1, result.stderr);
  });
}
