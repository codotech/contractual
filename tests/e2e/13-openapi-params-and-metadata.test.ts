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

function setupPetstore31(dir: string) {
  setupRepoWithConfig(dir, [
    { name: 'petstore', type: 'openapi', path: 'specs/petstore.yaml' },
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
}

describe('OpenAPI parameter classification', () => {
  test('adding optional parameter is non-breaking', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-nonbreaking-optional-param.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('adding required parameter is breaking', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-breaking-required-param.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });
});

describe('OpenAPI metadata change detection', () => {
  test('description/summary changes are detected as patch (not breaking)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-description-changed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      // Description changes should not be breaking
      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('description changes create a changeset', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-description-changed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);
      // Should create a changeset (not "No changes detected")
      expect(result.stdout).toMatch(/created changeset/i);
    } finally {
      cleanup();
    }
  });

  test('description changes detected in diff command', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-description-changed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('diff', dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/change|patch|description/i);
    } finally {
      cleanup();
    }
  });
});
