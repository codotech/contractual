import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { lintJsonSchema } from '../../packages/governance/linters/json-schema-ajv.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('schema draft URL recognition', () => {
  test.each([
    ['http://json-schema.org/draft-04/schema#', false],
    ['https://json-schema.org/draft-06/schema#', false],
    ['https://json-schema.org/draft-07/schema#', false],
    ['https://json-schema.org/draft/2019-09/schema', false],
    ['https://json-schema.org/draft/2020-12/schema', false],
    ['https://json-schema.org.evil.test/draft-07/schema', true],
    ['https://evil-json-schema.org/draft-07/schema', true],
    ['https://evil.test/json-schema.org/draft-07/schema', true],
    ['https://evil.test/?draft-07=json-schema.org', true],
    ['https://json-schema.org@evil.test/draft-07/schema', true],
    ['https://json-schema.org/unknown/schema', true],
    ['https://json-schema.org/draft-07/schema/extra', true],
    ['ftp://json-schema.org/draft-07/schema', true],
    ['not-a-url', true],
  ])('recognizes only supported drafts on the official host: %s', async ($schema, unknown) => {
    const directory = mkdtempSync(join(tmpdir(), 'contractual-schema-uri-'));
    directories.push(directory);
    const path = join(directory, 'schema.json');
    writeFileSync(path, JSON.stringify({ $schema, type: 'object' }));
    const result = await lintJsonSchema(path, { skipMetaValidation: true, skipStyleRules: true });
    expect(result.warnings.some((issue) => issue.rule === 'unknown-draft')).toBe(unknown);
  });
});

describe('release-preview trust boundary', () => {
  const workflow = parse(
    readFileSync(new URL('../../.github/workflows/release-preview.yml', import.meta.url), 'utf8')
  );

  test('only executes trusted next code, without a caller-selected checkout', () => {
    expect(workflow.on.workflow_dispatch.inputs).not.toHaveProperty('target_branch');
    expect(workflow.jobs.preview.if).toBe("github.ref == 'refs/heads/next'");
    const checkout = workflow.jobs.preview.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('actions/checkout@')
    );
    expect(checkout.with.ref).toBe('next');
    expect(checkout.with['persist-credentials']).toBe(false);
  });

  test('keeps read-only permissions and does not restore or save caches', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const step of workflow.jobs.preview.steps) {
      expect(step.uses || '').not.toMatch(/^actions\/cache(?:\/|@)/);
      expect(step.with?.cache).toBeUndefined();
    }
  });
});
