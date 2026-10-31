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
  fileExists,
  listFiles,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual full lifecycle', () => {
  test('complete cycle: init -> first release -> changes -> changeset -> second release', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // ===== PHASE 1: Setup with a spec using setupRepoWithConfig =====
      setupRepoWithConfig(dir, [
        {
          name: 'order',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // ===== PHASE 2: Create initial changeset manually, run version (1.0.0) =====
      const initialChangeset = `---
"order": major
---

## order

- **[major]** Initial release of order schema
`;
      writeFile(dir, '.contractual/changesets/initial-release.md', initialChangeset);

      // Run version to consume the changeset
      const versionResult1 = run('version', dir);
      expect(versionResult1.exitCode).toBe(0);
      expect(versionResult1.stdout).toMatch(/1\.0\.0/);

      // Verify versions.json was updated
      const versions1 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions1['order']).toBeDefined();
      expect(versions1['order'].version).toBe('1.0.0');

      // Verify changeset was consumed
      const changesetsAfterV1 = listFiles(dir, '.contractual/changesets');
      expect(changesetsAfterV1.filter((f) => f.endsWith('.md'))).toHaveLength(0);

      // Verify snapshot was created
      expect(fileExists(dir, '.contractual/snapshots/order.json')).toBe(true);

      // Verify CHANGELOG.md was created
      expect(fileExists(dir, 'CHANGELOG.md')).toBe(true);
      const changelog1 = readFile(dir, 'CHANGELOG.md');
      expect(changelog1).toMatch(/1\.0\.0/);

      // ===== PHASE 3: Make breaking change to spec =====
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      // ===== PHASE 4: Run changeset command (auto-detect) =====
      const changesetResult = run('changeset', dir);
      expect(changesetResult.exitCode).toBe(0);
      expect(changesetResult.stdout).toMatch(/created changeset/i);

      // Verify a changeset file was created
      const changesetsAfterDetect = listFiles(dir, '.contractual/changesets');
      const mdFiles = changesetsAfterDetect.filter((f) => f.endsWith('.md'));
      expect(mdFiles.length).toBeGreaterThan(0);

      // Verify the changeset contains major bump (breaking change)
      const changesetFile = readFile(dir, `.contractual/changesets/${mdFiles[0]}`);
      expect(changesetFile).toMatch(/major/i);

      // ===== PHASE 5: Run status (shows projected bump) =====
      const statusResult = run('status', dir);
      expect(statusResult.exitCode).toBe(0);
      expect(statusResult.stdout).toMatch(/1\.0\.0/); // Current version
      expect(statusResult.stdout).toMatch(/2\.0\.0/); // Projected version
      expect(statusResult.stdout).toMatch(/major/i);
      expect(statusResult.stdout).toMatch(/pending/i);

      // ===== PHASE 6: Run version (bumps to 2.0.0) =====
      const versionResult2 = run('version', dir);
      expect(versionResult2.exitCode).toBe(0);
      expect(versionResult2.stdout).toMatch(/2\.0\.0/);

      // Verify versions.json was updated
      const versions2 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions2['order'].version).toBe('2.0.0');

      // Verify CHANGELOG.md was updated
      const changelog2 = readFile(dir, 'CHANGELOG.md');
      expect(changelog2).toMatch(/2\.0\.0/);
      expect(changelog2).toMatch(/1\.0\.0/); // Previous version still there

      // ===== PHASE 7: Verify breaking shows no changes after version =====
      const breakingResult = run('breaking', dir);
      expect(breakingResult.exitCode).toBe(0);
      expect(breakingResult.stdout).toMatch(/no.*change|no breaking/i);
    } finally {
      cleanup();
    }
  });

  test('multiple releases accumulate in changelog (1.0.0 -> 1.1.0 -> 1.1.1)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Setup initial state
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // Create snapshot (simulating a previous version)
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      // ===== Release 1.0.0 =====
      const release1Changeset = `---
"order-schema": major
---

## order-schema

- **[major]** Initial release
`;
      writeFile(dir, '.contractual/changesets/release-1.md', release1Changeset);

      const version1 = run('version', dir);
      expect(version1.exitCode).toBe(0);

      const versions1 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions1['order-schema'].version).toBe('1.0.0');

      // ===== Release 1.1.0 (minor bump - add optional field) =====
      copyFixture(
        'json-schema/order-optional-field-added.json',
        path.join(dir, 'schemas/order.json')
      );

      // Auto-detect changes
      const changeset2 = run('changeset', dir);
      expect(changeset2.exitCode).toBe(0);

      const version2 = run('version', dir);
      expect(version2.exitCode).toBe(0);

      const versions2 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions2['order-schema'].version).toBe('1.1.0');

      // ===== Release 1.1.1 (patch bump - description change) =====
      copyFixture(
        'json-schema/order-description-changed.json',
        path.join(dir, 'schemas/order.json')
      );

      // Create manual patch changeset
      const patchChangeset = `---
"order-schema": patch
---

## order-schema

- **[patch]** Updated description text
`;
      writeFile(dir, '.contractual/changesets/patch-desc.md', patchChangeset);

      const version3 = run('version', dir);
      expect(version3.exitCode).toBe(0);

      const versions3 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions3['order-schema'].version).toBe('1.1.1');

      // ===== Verify changelog has all three versions =====
      const changelog = readFile(dir, 'CHANGELOG.md');
      expect(changelog).toMatch(/1\.0\.0/);
      expect(changelog).toMatch(/1\.1\.0/);
      expect(changelog).toMatch(/1\.1\.1/);

      // Verify order in changelog (newest first typically)
      const v100Index = changelog.indexOf('1.0.0');
      const v110Index = changelog.indexOf('1.1.0');
      const v111Index = changelog.indexOf('1.1.1');

      // Newest versions should appear first in changelog
      expect(v111Index).toBeLessThan(v110Index);
      expect(v110Index).toBeLessThan(v100Index);
    } finally {
      cleanup();
    }
  });

  test('handles multiple contracts with independent versioning', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
        {
          name: 'user-schema',
          type: 'json-schema',
          path: 'schemas/user.json',
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

      // ===== Release both contracts at 1.0.0 =====
      const initialChangeset = `---
"order-schema": major
"user-schema": major
---

Initial release of both schemas
`;
      writeFile(dir, '.contractual/changesets/initial.md', initialChangeset);

      const version1 = run('version', dir);
      expect(version1.exitCode).toBe(0);

      const versions1 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions1['order-schema'].version).toBe('1.0.0');
      expect(versions1['user-schema'].version).toBe('1.0.0');

      // ===== Bump only order-schema to 2.0.0 =====
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      const orderChangeset = `---
"order-schema": major
---

## order-schema

- **[BREAKING]** Removed customer_email field
`;
      writeFile(dir, '.contractual/changesets/order-breaking.md', orderChangeset);

      const version2 = run('version', dir);
      expect(version2.exitCode).toBe(0);

      const versions2 = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions2['order-schema'].version).toBe('2.0.0');
      expect(versions2['user-schema'].version).toBe('1.0.0'); // Unchanged

      // ===== Verify status shows correct versions =====
      const status = run('status', dir);
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toMatch(/order-schema/);
      expect(status.stdout).toMatch(/2\.0\.0/);
      expect(status.stdout).toMatch(/user-schema/);
    } finally {
      cleanup();
    }
  });

  test('version command with no changesets does nothing', () => {
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

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // No changesets - just run version
      const result = run('version', dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no pending|nothing to version/i);

      // Version should remain unchanged
      const versions = readJSON(dir, '.contractual/versions.json') as Record<
        string,
        { version: string }
      >;
      expect(versions['order-schema'].version).toBe('1.0.0');
    } finally {
      cleanup();
    }
  });

  test('changeset command with no changes does nothing', () => {
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

      // Create snapshot matching current spec
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

      // Spec matches snapshot - no changes
      const result = run('changeset', dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no change/i);

      // No changeset should be created
      const changesets = listFiles(dir, '.contractual/changesets');
      expect(changesets.filter((f) => f.endsWith('.md'))).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});
