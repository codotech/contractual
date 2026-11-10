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

describe('OpenAPI 3.1 differ', () => {
  test('detects breaking change when endpoint is removed (3.1 spec)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      copyFixture(
        'openapi/petstore-31-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      copyFixture(
        'openapi/petstore-31-breaking-endpoint-removed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });

  test('detects breaking change when type is narrowed (3.1 type arrays)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      copyFixture(
        'openapi/petstore-31-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // tag field narrowed from ["string", "null"] to "string"
      copyFixture(
        'openapi/petstore-31-breaking-type-narrowed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });

  test('detects non-breaking change when type is widened (3.1 type arrays)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      copyFixture(
        'openapi/petstore-31-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // id field widened from integer to [integer, string]
      copyFixture(
        'openapi/petstore-31-nonbreaking-type-widened.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('reports no changes when 3.1 specs are identical', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      copyFixture(
        'openapi/petstore-31-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Same spec as snapshot
      copyFixture(
        'openapi/petstore-31-base.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no.*change|no breaking|identical/i);
    } finally {
      cleanup();
    }
  });

  test('returns JSON output for 3.1 spec with --format json', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      copyFixture(
        'openapi/petstore-31-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      copyFixture(
        'openapi/petstore-31-breaking-endpoint-removed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking --format json', dir, { expectFail: true });
      const parsed = JSON.parse(result.stdout);

      expect(parsed).toHaveProperty('results');
      expect(parsed).toHaveProperty('hasBreaking');
      expect(parsed.hasBreaking).toBe(true);
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0]).toHaveProperty('contract', 'petstore');
    } finally {
      cleanup();
    }
  });
});
