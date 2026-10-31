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

describe('OpenAPI change message formatting', () => {
  test('path-added shows a readable message (not "Unknown change")', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        { name: 'petstore', type: 'openapi', path: 'specs/petstore.yaml' },
      ]);
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
      copyFixture(
        'openapi/petstore-nonbreaking-endpoint-added.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('diff --format json', dir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const changes = parsed.contracts?.petstore?.changes ?? [];

      // Find the path-added change
      const pathAdded = changes.find((c: { category: string }) => c.category === 'path-added');
      expect(pathAdded).toBeDefined();
      expect(pathAdded.message).not.toMatch(/unknown change/i);
      expect(pathAdded.message).toMatch(/new path added/i);
    } finally {
      cleanup();
    }
  });

  test('path paths in messages are decoded from JSON Pointer', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        { name: 'petstore', type: 'openapi', path: 'specs/petstore.yaml' },
      ]);
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
      copyFixture(
        'openapi/petstore-breaking-endpoint-removed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('diff --format json', dir, { expectFail: false });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const changes = parsed.contracts?.petstore?.changes ?? [];

      // All messages should be decoded (no ~1 or ~0 escapes)
      for (const change of changes) {
        expect(change.message).not.toMatch(/~1/);
        expect(change.message).not.toMatch(/~0/);
      }
    } finally {
      cleanup();
    }
  });

  test('operation-added shows readable message', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-nonbreaking-optional-param.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('diff --format json', dir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const changes = parsed.contracts?.petstore?.changes ?? [];

      // parameter-added case
      const paramAdded = changes.find(
        (c: { category: string }) => c.category === 'parameter-added'
      );
      expect(paramAdded).toBeDefined();
      expect(paramAdded.message).not.toMatch(/unknown change/i);
      expect(paramAdded.message).toMatch(/optional parameter added/i);
    } finally {
      cleanup();
    }
  });

  test('required parameter added shows specific message', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-breaking-required-param.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('diff --format json', dir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const changes = parsed.contracts?.petstore?.changes ?? [];

      const reqParam = changes.find(
        (c: { category: string }) => c.category === 'parameter-required-added'
      );
      expect(reqParam).toBeDefined();
      expect(reqParam.message).not.toMatch(/unknown change/i);
      expect(reqParam.message).toMatch(/required parameter added/i);
    } finally {
      cleanup();
    }
  });

  test('no "Unknown change" messages for any OpenAPI structural change', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupPetstore31(dir);
      copyFixture(
        'openapi/petstore-31-description-changed.yaml',
        path.join(dir, 'specs/petstore.yaml')
      );

      const result = run('diff --format json', dir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const changes = parsed.contracts?.petstore?.changes ?? [];

      expect(changes.length).toBeGreaterThan(0);
      for (const change of changes) {
        expect(change.message).not.toMatch(/unknown change/i);
      }
    } finally {
      cleanup();
    }
  });
});
