import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readFile,
  readJSON,
  listFiles,
  fileExists,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual version', () => {
  test('consumes changeset, bumps version, updates snapshot, writes changelog', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Setup repo with a contract
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // Set initial version
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create a changeset
      writeFile(
        dir,
        '.contractual/changesets/add-notes-field.md',
        `---
"order-schema": minor
---
## order-schema
- Added optional notes field to order
`
      );

      const result = run('version', dir);

      // Assert: command succeeds
      expect(result.exitCode).toBe(0);

      // Assert: version bumped to 1.1.0 (minor bump from 1.0.0)
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string; released: string }
      >;
      expect(versions['order-schema'].version).toBe('1.1.0');
      expect(versions['order-schema'].released).toBeDefined();

      // Assert: snapshot created/updated
      expect(fileExists(dir, '.contractual/snapshots/order-schema.json')).toBe(true);

      // Assert: changelog created with entry
      expect(fileExists(dir, 'CHANGELOG.md')).toBe(true);
      const changelog = readFile(dir, 'CHANGELOG.md');
      expect(changelog).toContain('# Changelog');
      expect(changelog).toContain('[order-schema] v1.1.0');
      expect(changelog).toContain('Added optional notes field');

      // Assert: changeset file removed
      const changesetFiles = listFiles(dir, '.contractual/changesets');
      expect(changesetFiles).not.toContain('add-notes-field.md');

      // Assert: stdout confirms version bump
      expect(result.stdout).toMatch(/1\.0\.0.*->.*1\.1\.0/);
    } finally {
      cleanup();
    }
  });

  test('multiple changesets: highest bump wins (major > minor > patch)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'api-schema',
          type: 'json-schema',
          path: 'schemas/api.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/api.json'));

      // Set initial version
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'api-schema': { version: '2.5.3', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create multiple changesets with different bump types
      // Changeset 1: patch bump
      writeFile(
        dir,
        '.contractual/changesets/fix-typo.md',
        `---
"api-schema": patch
---
## api-schema
- Fixed typo in description
`
      );

      // Changeset 2: minor bump
      writeFile(
        dir,
        '.contractual/changesets/add-field.md',
        `---
"api-schema": minor
---
## api-schema
- Added new optional field
`
      );

      // Changeset 3: major bump (should win)
      writeFile(
        dir,
        '.contractual/changesets/breaking-change.md',
        `---
"api-schema": major
---
## api-schema
- Removed deprecated endpoint (BREAKING)
`
      );

      const result = run('version', dir);

      // Assert: command succeeds
      expect(result.exitCode).toBe(0);

      // Assert: major bump applied (2.5.3 -> 3.0.0)
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['api-schema'].version).toBe('3.0.0');

      // Assert: all changesets consumed
      const changesetFiles = listFiles(dir, '.contractual/changesets');
      expect(changesetFiles).toHaveLength(0);

      // Assert: changelog contains all changes
      const changelog = readFile(dir, 'CHANGELOG.md');
      expect(changelog).toContain('v3.0.0');
      expect(changelog).toContain('Fixed typo');
      expect(changelog).toContain('Added new optional field');
      expect(changelog).toContain('Removed deprecated endpoint');
    } finally {
      cleanup();
    }
  });

  test('no changesets does nothing', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // Set version but no changesets
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      const result = run('version', dir);

      // Assert: command succeeds (no-op)
      expect(result.exitCode).toBe(0);

      // Assert: version unchanged
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['order-schema'].version).toBe('1.0.0');

      // Assert: no changelog created
      expect(fileExists(dir, 'CHANGELOG.md')).toBe(false);

      // Assert: stdout indicates nothing to do
      expect(result.stdout).toMatch(/no.*changeset|nothing/i);
    } finally {
      cleanup();
    }
  });

  test('first version: 0.0.0 -> 1.0.0 on major', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'new-api',
          type: 'json-schema',
          path: 'schemas/new-api.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/new-api.json'));

      // No initial version (first release)
      // versions.json is empty (setup creates empty object)

      // Create changeset with major bump
      writeFile(
        dir,
        '.contractual/changesets/initial-release.md',
        `---
"new-api": major
---
## new-api
- Initial release of the API
`
      );

      const result = run('version', dir);

      // Assert: command succeeds
      expect(result.exitCode).toBe(0);

      // Assert: version is 1.0.0 (major bump from implicit 0.0.0)
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['new-api'].version).toBe('1.0.0');

      // Assert: snapshot created
      expect(fileExists(dir, '.contractual/snapshots/new-api.json')).toBe(true);

      // Assert: changelog created
      expect(fileExists(dir, 'CHANGELOG.md')).toBe(true);
      const changelog = readFile(dir, 'CHANGELOG.md');
      expect(changelog).toContain('[new-api] v1.0.0');
      expect(changelog).toContain('Initial release');

      // Assert: stdout shows bump from 0.0.0
      expect(result.stdout).toMatch(/0\.0\.0.*->.*1\.0\.0/);
    } finally {
      cleanup();
    }
  });

  test('changelog appends, does not overwrite existing entries', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'api',
          type: 'json-schema',
          path: 'schemas/api.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/api.json'));

      // Set initial version
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create existing changelog with previous entries
      writeFile(
        dir,
        'CHANGELOG.md',
        `# Changelog

## [api] v1.0.0 - 2026-01-01

- Initial release with core features
- Added authentication support
`
      );

      // Create a new changeset
      writeFile(
        dir,
        '.contractual/changesets/add-feature.md',
        `---
"api": minor
---
## api
- Added pagination support
`
      );

      const result = run('version', dir);

      // Assert: command succeeds
      expect(result.exitCode).toBe(0);

      // Assert: version bumped
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['api'].version).toBe('1.1.0');

      // Assert: changelog preserved old entries AND has new entry
      const changelog = readFile(dir, 'CHANGELOG.md');

      // New entry should be present
      expect(changelog).toContain('[api] v1.1.0');
      expect(changelog).toContain('Added pagination support');

      // Old entries should still be present
      expect(changelog).toContain('[api] v1.0.0');
      expect(changelog).toContain('Initial release with core features');
      expect(changelog).toContain('Added authentication support');

      // New entry should come before old entry (prepended)
      const v110Index = changelog.indexOf('[api] v1.1.0');
      const v100Index = changelog.indexOf('[api] v1.0.0');
      expect(v110Index).toBeLessThan(v100Index);
    } finally {
      cleanup();
    }
  });

  test('handles multiple contracts in one changeset', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'orders-api',
          type: 'json-schema',
          path: 'schemas/orders.json',
        },
        {
          name: 'users-api',
          type: 'json-schema',
          path: 'schemas/users.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/orders.json'));
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/users.json'));

      // Set initial versions
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'orders-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          'users-api': { version: '2.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create changeset affecting both contracts
      writeFile(
        dir,
        '.contractual/changesets/shared-update.md',
        `---
"orders-api": minor
"users-api": patch
---
## orders-api
- Added bulk operations endpoint

## users-api
- Fixed validation message
`
      );

      const result = run('version', dir);

      // Assert: command succeeds
      expect(result.exitCode).toBe(0);

      // Assert: both versions bumped appropriately
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['orders-api'].version).toBe('1.1.0');
      expect(versions['users-api'].version).toBe('2.0.1');

      // Assert: both snapshots created
      expect(fileExists(dir, '.contractual/snapshots/orders-api.json')).toBe(true);
      expect(fileExists(dir, '.contractual/snapshots/users-api.json')).toBe(true);

      // Assert: changelog has entries for both
      const changelog = readFile(dir, 'CHANGELOG.md');
      expect(changelog).toContain('[orders-api] v1.1.0');
      expect(changelog).toContain('[users-api] v2.0.1');
      expect(changelog).toContain('Added bulk operations endpoint');
      expect(changelog).toContain('Fixed validation message');
    } finally {
      cleanup();
    }
  });

  test('preserves all changesets and versions when a contract is unknown', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'existing-api',
          type: 'json-schema',
          path: 'schemas/existing.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/existing.json'));

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'existing-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create changeset referencing a non-existent contract
      writeFile(
        dir,
        '.contractual/changesets/mixed-update.md',
        `---
"existing-api": minor
"nonexistent-api": major
---
## existing-api
- Updated existing API

## nonexistent-api
- This contract does not exist
`
      );

      const result = run('version', dir, { expectFail: true });

      // Validation happens before any version or changeset mutation.
      expect(result.exitCode).not.toBe(0);

      // Assert: existing contract was not bumped
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['existing-api'].version).toBe('1.0.0');

      // Assert: nonexistent contract was not added to versions
      expect(versions['nonexistent-api']).toBeUndefined();

      // Assert: changeset was preserved
      const changesetFiles = listFiles(dir, '.contractual/changesets');
      expect(changesetFiles).toEqual(['mixed-update.md']);

      // Assert: no changelog was created
      expect(fileExists(dir, 'CHANGELOG.md')).toBe(false);
    } finally {
      cleanup();
    }
  });
});
