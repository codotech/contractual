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

describe('OpenAPI differ (native)', () => {
  test('detects breaking change when endpoint is removed', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      // Set up base spec as snapshot (simulating previous release)
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Current spec has endpoint removed (breaking change)
      copyFixture(
        'openapi/petstore-breaking-endpoint-removed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });

  test('detects non-breaking change when endpoint is added', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      // Set up base spec as snapshot
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Current spec has new endpoint added (non-breaking change)
      copyFixture(
        'openapi/petstore-nonbreaking-endpoint-added.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir);
      // Non-breaking changes should exit 0
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/non-breaking|minor|no breaking/i);
    } finally {
      cleanup();
    }
  });

  test('reports no changes when specs are identical', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      // Set up base spec as snapshot
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Current spec is identical to snapshot
      copyFixture('openapi/petstore-identical.yaml', path.join(dir, 'specs/petstore.yaml'));

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no.*change|no breaking|identical/i);
    } finally {
      cleanup();
    }
  });

  test('detects breaking change when response type is changed', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      // Set up base spec as snapshot
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Current spec has type change (breaking)
      copyFixture(
        'openapi/petstore-breaking-type-changed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });

  test('detects non-breaking change when only description is updated', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      // Set up base spec as snapshot
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Current spec has only description changed (non-breaking)
      copyFixture(
        'openapi/petstore-nonbreaking-description.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('returns JSON output with --format json flag', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);

      // Set up base spec as snapshot
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, '.contractual/snapshots/petstore.yaml')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Current spec has breaking change
      copyFixture(
        'openapi/petstore-breaking-endpoint-removed.yaml',
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
