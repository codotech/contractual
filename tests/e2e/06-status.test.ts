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

describe('contractual status', () => {
  test('shows current versions from versions.json', () => {
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

      // Set up versions
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.2.3', released: '2026-01-15T10:00:00Z' },
          'user-schema': { version: '2.0.0', released: '2026-02-01T12:00:00Z' },
        })
      );

      const result = run('status', dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/order-schema/);
      expect(result.stdout).toMatch(/1\.2\.3/);
      expect(result.stdout).toMatch(/user-schema/);
      expect(result.stdout).toMatch(/2\.0\.0/);
    } finally {
      cleanup();
    }
  });

  test('shows pending changesets', () => {
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

      // Set up version
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create a pending changeset
      const changesetContent = `---
"order-schema": minor
---

## order-schema

- **[minor]** Added optional tracking_number field
`;
      writeFile(dir, '.contractual/changesets/friendly-tiger.md', changesetContent);

      const result = run('status', dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/pending/i);
      expect(result.stdout).toMatch(/friendly-tiger\.md/);
      expect(result.stdout).toMatch(/order-schema/);
      expect(result.stdout).toMatch(/minor/i);
    } finally {
      cleanup();
    }
  });

  test('shows projected bumps based on pending changesets', () => {
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

      // Set up versions
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          'user-schema': { version: '1.5.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create a changeset with major bump for order-schema
      const changesetContent = `---
"order-schema": major
"user-schema": patch
---

## order-schema

- **[BREAKING]** Removed customer_email field

## user-schema

- **[patch]** Updated description
`;
      writeFile(dir, '.contractual/changesets/breaking-change.md', changesetContent);

      const result = run('status', dir);

      expect(result.exitCode).toBe(0);
      // Should show projected version 2.0.0 for order-schema (major bump from 1.0.0)
      expect(result.stdout).toMatch(/2\.0\.0/);
      // Should show projected version 1.5.1 for user-schema (patch bump from 1.5.0)
      expect(result.stdout).toMatch(/1\.5\.1/);
      // Should indicate major and patch bumps
      expect(result.stdout).toMatch(/major/i);
      expect(result.stdout).toMatch(/patch/i);
    } finally {
      cleanup();
    }
  });

  test('handles empty state (no versions, no changesets)', () => {
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

      // versions.json is empty (created by setupRepoWithConfig)
      const result = run('status', dir);

      expect(result.exitCode).toBe(0);
      // Should show 0.0.0 or unreleased
      expect(result.stdout).toMatch(/0\.0\.0|unreleased/i);
      // Should indicate no pending changesets
      expect(result.stdout).toMatch(/no pending changeset/i);
    } finally {
      cleanup();
    }
  });

  test('aggregates multiple changesets correctly (highest bump wins)', () => {
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

      // Set up version
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create multiple changesets - patch and minor for same contract
      const patchChangeset = `---
"order-schema": patch
---

Fixed typo in description
`;
      const minorChangeset = `---
"order-schema": minor
---

Added optional field
`;
      writeFile(dir, '.contractual/changesets/fix-typo.md', patchChangeset);
      writeFile(dir, '.contractual/changesets/add-field.md', minorChangeset);

      const result = run('status', dir);

      expect(result.exitCode).toBe(0);
      // Should show 2 pending changesets
      expect(result.stdout).toMatch(/2.*changeset/i);
      // Should project to 1.1.0 (minor wins over patch)
      expect(result.stdout).toMatch(/1\.1\.0/);
    } finally {
      cleanup();
    }
  });

  test('reports error when not initialized', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Don't run init or setupRepoWithConfig - no .contractual directory

      const result = run('status', dir, { expectFail: true });

      expect(result.exitCode).toBe(1);
      // Error message contains "No contractual.yaml found"
      expect(result.stdout + result.stderr).toMatch(/contractual\.yaml|init/i);
    } finally {
      cleanup();
    }
  });
});
