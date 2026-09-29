import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lintJsonSchema } from './json-schema-ajv.js';

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
);
test.each([
  ['https://json-schema.org/draft-07/schema#', false],
  ['https://json-schema.org.evil.test/draft-07/schema', true],
  ['https://evil.test/json-schema.org/draft-07/schema', true],
  ['https://evil.test/?draft-07=json-schema.org', true],
  ['not-a-url', true],
])('checks the parsed schema URI: %s', async ($schema, unknown) => {
  const directory = mkdtempSync(join(tmpdir(), 'schema-uri-test-'));
  directories.push(directory);
  const path = join(directory, 'schema.json');
  writeFileSync(path, JSON.stringify({ $schema, type: 'object' }));
  const result = await lintJsonSchema(path, { skipMetaValidation: true, skipStyleRules: true });
  expect(result.warnings.some((issue) => issue.rule === 'unknown-draft')).toBe(unknown);
});
