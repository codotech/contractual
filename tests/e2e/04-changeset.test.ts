import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readFile,
  listFiles,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual changeset', () => {
  test('auto-generates changeset from detected breaking changes (major bump)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // Put base as snapshot (simulating a previous release)
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Put breaking variant as current spec (field removed)
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      // A changeset file should exist
      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets.length).toBeGreaterThanOrEqual(1);

      // Parse the changeset
      const content = readFile(dir, `.contractual/changesets/${changesets[0]}`);

      // Frontmatter should have major bump
      expect(content).toMatch(/"order-schema":\s*major/);

      // Body should contain the contract name section
      expect(content).toMatch(/##\s*order-schema/);

      // Body should mention BREAKING
      expect(content).toMatch(/\*\*\[BREAKING\]\*\*/);
    } finally {
      cleanup();
    }
  });

  test('auto-generates minor changeset for non-breaking changes', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // Put base as snapshot
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Put non-breaking variant as current spec (optional field added)
      copyFixture(
        'json-schema/order-optional-field-added.json',
        path.join(dir, 'schemas/order.json')
      );

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets.length).toBeGreaterThanOrEqual(1);

      const content = readFile(dir, `.contractual/changesets/${changesets[0]}`);

      // Frontmatter should have minor bump (not major)
      expect(content).toMatch(/"order-schema":\s*minor/);

      // Body should contain the contract section
      expect(content).toMatch(/##\s*order-schema/);

      // Body should mention minor or non-breaking change
      expect(content).toMatch(/\*\*\[minor\]\*\*/);
    } finally {
      cleanup();
    }
  });

  test('no changes -> no changeset created, clean exit', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // Put base as snapshot
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      // Put identical spec as current
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      // Output should indicate no changes
      expect(result.stdout).toMatch(/no changes/i);

      // No changeset files should be created (except .gitkeep if present)
      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('changeset for multiple contracts in one file', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
        { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
      ]);

      // Both have snapshots at v1 (using order-base as template for both)
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/user-schema.json')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          'user-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Breaking change to order (field removed), non-breaking to user (optional field added)
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
      copyFixture(
        'json-schema/order-optional-field-added.json',
        path.join(dir, 'schemas/user.json')
      );

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets.length).toBeGreaterThanOrEqual(1);

      const content = readFile(dir, `.contractual/changesets/${changesets[0]}`);

      // Should have both contracts in the frontmatter
      expect(content).toMatch(/"order-schema":\s*major/);
      expect(content).toMatch(/"user-schema":\s*minor/);

      // Should have sections for both contracts
      expect(content).toMatch(/##\s*order-schema/);
      expect(content).toMatch(/##\s*user-schema/);
    } finally {
      cleanup();
    }
  });

  test('first version contract (no snapshot) is skipped', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // No snapshot exists - first version
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // Empty versions
      writeFile(dir, '.contractual/versions.json', '{}');

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      // No changes to detect without a snapshot
      expect(result.stdout).toMatch(/no changes/i);

      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('changeset with type change (breaking)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Type changed (breaking)
      copyFixture('json-schema/order-type-changed.json', path.join(dir, 'schemas/order.json'));

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets.length).toBeGreaterThanOrEqual(1);

      const content = readFile(dir, `.contractual/changesets/${changesets[0]}`);

      // Should be major bump
      expect(content).toMatch(/"order-schema":\s*major/);
    } finally {
      cleanup();
    }
  });

  test('contract with breaking detection disabled is skipped', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
          breaking: false,
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Breaking change that would normally be detected
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      // No changeset should be created since breaking detection is disabled
      expect(result.stdout).toMatch(/no changes/i);

      const changesets = listFiles(dir, '.contractual/changesets').filter((f) => f.endsWith('.md'));
      expect(changesets).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('changeset output indicates created file path', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      const result = run('changeset', dir);
      expect(result.exitCode).toBe(0);

      // Output should mention the changeset file was created
      expect(result.stdout).toMatch(/created.*changeset/i);
      expect(result.stdout).toMatch(/\.contractual\/changesets/);
      expect(result.stdout).toMatch(/\.md/);
    } finally {
      cleanup();
    }
  });
});
