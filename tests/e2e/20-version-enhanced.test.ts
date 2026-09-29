import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readJSON,
  fileExists,
  listFiles,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual version (enhanced)', () => {
  describe('--dry-run', () => {
    test('shows preview without applying changes', () => {
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

        // Create changeset
        const changeset = `---
"order-schema": minor
---

Added new feature
`;
        writeFile(dir, '.contractual/changesets/feature.md', changeset);

        const result = run('version --dry-run', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/dry run|preview/i);
        expect(result.stdout).toMatch(/order-schema/);
        expect(result.stdout).toMatch(/1\.0\.0/);
        expect(result.stdout).toMatch(/1\.1\.0|minor/);
      } finally {
        cleanup();
      }
    });

    test('does not modify versions.json', () => {
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

        const changeset = `---
"order-schema": major
---

Breaking change
`;
        writeFile(dir, '.contractual/changesets/breaking.md', changeset);

        run('version --dry-run', dir);

        // Verify version unchanged
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['order-schema'].version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });

    test('does not delete changesets', () => {
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

        const changeset = `---
"order-schema": patch
---

Bug fix
`;
        writeFile(dir, '.contractual/changesets/fix.md', changeset);

        run('version --dry-run', dir);

        // Verify changeset still exists
        const changesets = listFiles(dir, '.contractual/changesets');
        expect(changesets).toContain('fix.md');
      } finally {
        cleanup();
      }
    });
  });

  describe('--json', () => {
    test('outputs structured JSON', () => {
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

        const changeset = `---
"order-schema": minor
---

New feature
`;
        writeFile(dir, '.contractual/changesets/feature.md', changeset);

        const result = run('version --json', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.bumps).toBeDefined();
        expect(Array.isArray(output.bumps)).toBe(true);

        if (output.bumps.length > 0) {
          expect(output.bumps[0].contract).toBe('order-schema');
          expect(output.bumps[0].old).toBe('1.0.0');
          expect(output.bumps[0].new).toBe('1.1.0');
          expect(output.bumps[0].type).toBe('minor');
        }
      } finally {
        cleanup();
      }
    });

    test('implies --yes (no prompts)', () => {
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

        const changeset = `---
"order-schema": minor
---

Feature
`;
        writeFile(dir, '.contractual/changesets/feat.md', changeset);

        // --json should apply without prompting (implies --yes)
        const result = run('version --json', dir);

        expect(result.exitCode).toBe(0);

        // Verify version was bumped
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['order-schema'].version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });

    test('works with --dry-run', () => {
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

        const changeset = `---
"order-schema": major
---

Breaking
`;
        writeFile(dir, '.contractual/changesets/breaking.md', changeset);

        const result = run('version --json --dry-run', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.dryRun).toBe(true);
        expect(output.bumps).toBeDefined();

        // Verify version NOT changed
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['order-schema'].version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('-y/--yes', () => {
    test('skips confirmation prompt', () => {
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

        const changeset = `---
"order-schema": patch
---

Fix
`;
        writeFile(dir, '.contractual/changesets/fix.md', changeset);

        const result = run('version --yes', dir);

        expect(result.exitCode).toBe(0);

        // Verify version was bumped
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['order-schema'].version).toBe('1.0.1');
      } finally {
        cleanup();
      }
    });

    test('applies changes immediately', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'api-1',
            type: 'json-schema',
            path: 'schemas/api1.json',
          },
          {
            name: 'api-2',
            type: 'json-schema',
            path: 'schemas/api2.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/api1.json'));
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/api2.json'));
        copyFixture(
          'json-schema/order-base.json',
          path.join(dir, '.contractual/snapshots/api-1.json')
        );
        copyFixture(
          'json-schema/order-base.json',
          path.join(dir, '.contractual/snapshots/api-2.json')
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'api-1': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
            'api-2': { version: '2.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        const changeset = `---
"api-1": minor
"api-2": major
---

Multiple changes
`;
        writeFile(dir, '.contractual/changesets/multi.md', changeset);

        const result = run('version -y', dir);

        expect(result.exitCode).toBe(0);

        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['api-1'].version).toBe('1.1.0');
        expect(versions['api-2'].version).toBe('3.0.0');

        // Verify changeset was consumed
        const changesets = listFiles(dir, '.contractual/changesets');
        expect(changesets.filter((f) => f.endsWith('.md'))).toHaveLength(0);
      } finally {
        cleanup();
      }
    });
  });

  describe('no changesets', () => {
    test('shows message when no changesets with --json', () => {
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

        // No changesets

        const result = run('version --json', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.bumps).toHaveLength(0);
        expect(output.changesets).toBe(0);
      } finally {
        cleanup();
      }
    });
  });
});
