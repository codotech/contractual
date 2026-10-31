import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('OpenAPI differ with circular $ref schemas', () => {
  test('handles identical specs with circular refs without stack overflow', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'circular-api',
          type: 'openapi',
          path: 'specs/api.yaml',
        },
      ]);

      copyFixture(
        'openapi/circular-refs-base.yaml',
        path.join(dir, '.contractual/snapshots/circular-api.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'circular-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Same spec — should produce no changes, not a stack overflow
      copyFixture(
        'openapi/circular-refs-base.yaml',
        path.join(dir, 'specs/api.yaml')
      );

      // 10s timeout — stack overflow would hang/crash without it
      const result = run('breaking', dir, { timeout: 10_000 });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no.*change|no breaking|identical/i);
    } finally {
      cleanup();
    }
  });

  test('detects breaking change in schema with circular refs', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'circular-api',
          type: 'openapi',
          path: 'specs/api.yaml',
        },
      ]);

      copyFixture(
        'openapi/circular-refs-base.yaml',
        path.join(dir, '.contractual/snapshots/circular-api.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'circular-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Category.id changed from integer to string — breaking
      copyFixture(
        'openapi/circular-refs-breaking.yaml',
        path.join(dir, 'specs/api.yaml')
      );

      const result = run('breaking', dir, { expectFail: true, timeout: 10_000 });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });
});
