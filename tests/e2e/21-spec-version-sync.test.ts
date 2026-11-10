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
  readYAML,
  fileExists,
  listFiles,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('spec version sync', () => {
  describe('OpenAPI (YAML)', () => {
    test('updates info.version in spec on version bump', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'petstore', type: 'openapi', path: 'specs/petstore.yaml' },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Copy to snapshot (simulating init)
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

        writeFile(
          dir,
          '.contractual/changesets/bump-petstore.md',
          `---\n"petstore": minor\n---\n\n## petstore\n- Added new endpoint\n`
        );

        const result = run('version', dir);
        expect(result.exitCode).toBe(0);

        // Spec file should have updated version
        const spec = readYAML(dir, 'specs/petstore.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.1.0');

        // Snapshot should also have updated version
        const snapshot = readYAML(dir, '.contractual/snapshots/petstore.yaml') as {
          info: { version: string };
        };
        expect(snapshot.info.version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });

    test('preserves YAML comments and formatting when updating version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        // Write a spec with comments
        writeFile(
          dir,
          'specs/api.yaml',
          `# My API spec
openapi: 3.0.3
info:
  title: My API
  # Current version
  version: 1.0.0
paths: {}
`
        );

        copyFixture(
          'openapi/petstore-base.yaml',
          path.join(dir, '.contractual/snapshots/api.yaml')
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"api": patch\n---\n\n## api\n- Fixed bug\n`
        );

        run('version', dir);

        const content = readFile(dir, 'specs/api.yaml');
        // Version updated
        expect(content).toContain('version: 1.0.1');
        // Comments preserved
        expect(content).toContain('# My API spec');
        expect(content).toContain('# Current version');
      } finally {
        cleanup();
      }
    });
  });

  describe('OpenAPI (JSON)', () => {
    test('updates info.version in JSON spec on version bump', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.json' },
        ]);

        writeFile(
          dir,
          'specs/api.json',
          JSON.stringify(
            {
              openapi: '3.0.3',
              info: { title: 'My API', version: '2.0.0' },
              paths: {},
            },
            null,
            2
          ) + '\n'
        );

        // Snapshot
        writeFile(
          dir,
          '.contractual/snapshots/api.json',
          JSON.stringify(
            {
              openapi: '3.0.3',
              info: { title: 'My API', version: '2.0.0' },
              paths: {},
            },
            null,
            2
          ) + '\n'
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '2.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"api": major\n---\n\n## api\n- Breaking change\n`
        );

        run('version', dir);

        const spec = readJSON(dir, 'specs/api.json') as { info: { version: string } };
        expect(spec.info.version).toBe('3.0.0');

        // Snapshot too
        const snapshot = readJSON(dir, '.contractual/snapshots/api.json') as {
          info: { version: string };
        };
        expect(snapshot.info.version).toBe('3.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('JSON Schema (no version field)', () => {
    test('does not modify json-schema spec (no standard version field)', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'order', type: 'json-schema', path: 'schemas/order.json' },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
        copyFixture(
          'json-schema/order-base.json',
          path.join(dir, '.contractual/snapshots/order.json')
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            order: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        const specBefore = readFile(dir, 'schemas/order.json');

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"order": minor\n---\n\n## order\n- Added field\n`
        );

        run('version', dir);

        // Spec content should be unchanged (no version field to update)
        const specAfter = readFile(dir, 'schemas/order.json');
        expect(specAfter).toBe(specBefore);

        // But versions.json should still be bumped
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['order'].version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('syncVersion: false', () => {
    test('does not update spec version when syncVersion is false', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            syncVersion: false,
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));
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

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"petstore": minor\n---\n\n## petstore\n- Added endpoint\n`
        );

        run('version', dir);

        // Spec should keep original version (1.0.27 from the fixture)
        const spec = readYAML(dir, 'specs/petstore.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.0.27');

        // But versions.json should still be bumped
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['petstore'].version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });

    test('mixed: syncs one contract, skips another with syncVersion: false', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'synced-api', type: 'openapi', path: 'specs/synced.yaml' },
          {
            name: 'unsynced-api',
            type: 'openapi',
            path: 'specs/unsynced.yaml',
            syncVersion: false,
          },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/synced.yaml', specContent);
        writeFile(dir, 'specs/unsynced.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/synced-api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/unsynced-api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'synced-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
            'unsynced-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/bump-both.md',
          `---\n"synced-api": minor\n"unsynced-api": minor\n---\n\n## synced-api\n- Change\n\n## unsynced-api\n- Change\n`
        );

        run('version', dir);

        // Synced: spec version updated
        const syncedSpec = readYAML(dir, 'specs/synced.yaml') as { info: { version: string } };
        expect(syncedSpec.info.version).toBe('1.1.0');

        // Unsynced: spec version unchanged
        const unsyncedSpec = readYAML(dir, 'specs/unsynced.yaml') as {
          info: { version: string };
        };
        expect(unsyncedSpec.info.version).toBe('1.0.0');

        // Both bumped in versions.json
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['synced-api'].version).toBe('1.1.0');
        expect(versions['unsynced-api'].version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('--no-sync-version CLI flag', () => {
    test('skips spec version update when --no-sync-version is passed', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' } })
        );

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"api": minor\n---\n\n## api\n- Feature\n`
        );

        run('version --no-sync-version', dir);

        // Spec should keep original version
        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.0.0');

        // But versions.json should still be bumped
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['api'].version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });

    test('--no-sync-version overrides syncVersion: true in config', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml', syncVersion: true },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' } })
        );

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"api": minor\n---\n\n## api\n- Feature\n`
        );

        run('version --no-sync-version', dir);

        // CLI flag wins over config
        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('missing version field in spec', () => {
    test('creates info.version when missing from OpenAPI spec', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        // Write a spec WITHOUT info.version
        writeFile(
          dir,
          'specs/api.yaml',
          `openapi: 3.0.3\ninfo:\n  title: No Version API\npaths: {}\n`
        );
        writeFile(
          dir,
          '.contractual/snapshots/api.yaml',
          `openapi: 3.0.3\ninfo:\n  title: No Version API\npaths: {}\n`
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '0.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/initial.md',
          `---\n"api": minor\n---\n\n## api\n- Initial feature\n`
        );

        run('version', dir);

        // Version field should be created
        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('0.1.0');
      } finally {
        cleanup();
      }
    });

    test('creates info object and version when info is missing from OpenAPI spec', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        // Write a spec WITHOUT info at all
        writeFile(dir, 'specs/api.yaml', `openapi: 3.0.3\npaths: {}\n`);
        writeFile(dir, '.contractual/snapshots/api.yaml', `openapi: 3.0.3\npaths: {}\n`);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '0.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/initial.md',
          `---\n"api": major\n---\n\n## api\n- Initial release\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/api.yaml') as { info?: { version?: string } };
        expect(spec.info).toBeDefined();
        expect(spec.info!.version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });

    test('creates info.version in JSON spec when missing', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.json' },
        ]);

        const specNoVersion = { openapi: '3.0.3', info: { title: 'Test' }, paths: {} };
        writeFile(dir, 'specs/api.json', JSON.stringify(specNoVersion, null, 2) + '\n');
        writeFile(
          dir,
          '.contractual/snapshots/api.json',
          JSON.stringify(specNoVersion, null, 2) + '\n'
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"api": patch\n---\n\n## api\n- Fix\n`
        );

        run('version', dir);

        const spec = readJSON(dir, 'specs/api.json') as { info: { version: string } };
        expect(spec.info.version).toBe('1.0.1');
      } finally {
        cleanup();
      }
    });
  });

  describe('all bump types', () => {
    test('patch bump syncs spec version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.2.3\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '1.2.3', released: '2026-01-01T00:00:00Z' } })
        );

        writeFile(
          dir,
          '.contractual/changesets/fix.md',
          `---\n"api": patch\n---\n\n## api\n- Bug fix\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.2.4');
      } finally {
        cleanup();
      }
    });

    test('minor bump syncs spec version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.2.3\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '1.2.3', released: '2026-01-01T00:00:00Z' } })
        );

        writeFile(
          dir,
          '.contractual/changesets/feature.md',
          `---\n"api": minor\n---\n\n## api\n- New feature\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.3.0');
      } finally {
        cleanup();
      }
    });

    test('major bump syncs spec version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 2.5.3\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '2.5.3', released: '2026-01-01T00:00:00Z' } })
        );

        writeFile(
          dir,
          '.contractual/changesets/breaking.md',
          `---\n"api": major\n---\n\n## api\n- Breaking change\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('3.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('first version (from 0.0.0)', () => {
    test('syncs spec version on first bump from implicit 0.0.0', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        writeFile(
          dir,
          'specs/api.yaml',
          `openapi: 3.0.3\ninfo:\n  title: New API\n  version: 0.0.0\npaths: {}\n`
        );
        writeFile(
          dir,
          '.contractual/snapshots/api.yaml',
          `openapi: 3.0.3\ninfo:\n  title: New API\n  version: 0.0.0\npaths: {}\n`
        );

        // No initial version in versions.json (first release)

        writeFile(
          dir,
          '.contractual/changesets/initial.md',
          `---\n"api": major\n---\n\n## api\n- Initial release\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.0.0');

        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['api'].version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('multiple changesets aggregation', () => {
    test('spec gets the aggregated version (highest bump wins)', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' } })
        );

        // Three changesets: patch, minor, major → major wins → 2.0.0
        writeFile(
          dir,
          '.contractual/changesets/fix.md',
          `---\n"api": patch\n---\n\n## api\n- Fix\n`
        );
        writeFile(
          dir,
          '.contractual/changesets/feature.md',
          `---\n"api": minor\n---\n\n## api\n- Feature\n`
        );
        writeFile(
          dir,
          '.contractual/changesets/breaking.md',
          `---\n"api": major\n---\n\n## api\n- Breaking\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('2.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('multi-contract', () => {
    test('syncs version in multiple OpenAPI specs from one changeset', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'orders-api', type: 'openapi', path: 'specs/orders.yaml' },
          { name: 'users-api', type: 'openapi', path: 'specs/users.yaml' },
        ]);

        const ordersSpec = `openapi: 3.0.3\ninfo:\n  title: Orders\n  version: 1.0.0\npaths: {}\n`;
        const usersSpec = `openapi: 3.0.3\ninfo:\n  title: Users\n  version: 2.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/orders.yaml', ordersSpec);
        writeFile(dir, 'specs/users.yaml', usersSpec);
        writeFile(dir, '.contractual/snapshots/orders-api.yaml', ordersSpec);
        writeFile(dir, '.contractual/snapshots/users-api.yaml', usersSpec);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'orders-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
            'users-api': { version: '2.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/update.md',
          `---\n"orders-api": minor\n"users-api": patch\n---\n\n## orders-api\n- New endpoint\n\n## users-api\n- Fix typo\n`
        );

        run('version', dir);

        const ordersResult = readYAML(dir, 'specs/orders.yaml') as { info: { version: string } };
        expect(ordersResult.info.version).toBe('1.1.0');

        const usersResult = readYAML(dir, 'specs/users.yaml') as { info: { version: string } };
        expect(usersResult.info.version).toBe('2.0.1');

        // Snapshots too
        const ordersSnapshot = readYAML(dir, '.contractual/snapshots/orders-api.yaml') as {
          info: { version: string };
        };
        expect(ordersSnapshot.info.version).toBe('1.1.0');

        const usersSnapshot = readYAML(dir, '.contractual/snapshots/users-api.yaml') as {
          info: { version: string };
        };
        expect(usersSnapshot.info.version).toBe('2.0.1');
      } finally {
        cleanup();
      }
    });

    test('mixed types: syncs OpenAPI, skips JSON Schema', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
          { name: 'order', type: 'json-schema', path: 'schemas/order.json' },
        ]);

        const apiSpec = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', apiSpec);
        writeFile(dir, '.contractual/snapshots/api.yaml', apiSpec);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
        copyFixture(
          'json-schema/order-base.json',
          path.join(dir, '.contractual/snapshots/order.json')
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
            order: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        const schemaBefore = readFile(dir, 'schemas/order.json');

        writeFile(
          dir,
          '.contractual/changesets/bump.md',
          `---\n"api": minor\n"order": minor\n---\n\n## api\n- Feature\n\n## order\n- Field added\n`
        );

        run('version', dir);

        // OpenAPI spec updated
        const apiResult = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(apiResult.info.version).toBe('1.1.0');

        // JSON Schema unchanged
        const schemaAfter = readFile(dir, 'schemas/order.json');
        expect(schemaAfter).toBe(schemaBefore);

        // Both bumped in versions.json
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['api'].version).toBe('1.1.0');
        expect(versions['order'].version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('pre-release version sync', () => {
    test('syncs pre-release version into spec', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        ]);

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);
        writeFile(dir, '.contractual/snapshots/api.yaml', specContent);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ api: { version: '1.0.0', released: '2026-01-01T00:00:00Z' } })
        );

        // Enter pre-release mode
        run('pre enter beta', dir);

        writeFile(
          dir,
          '.contractual/changesets/feature.md',
          `---\n"api": minor\n---\n\n## api\n- Beta feature\n`
        );

        run('version --yes', dir);

        // Spec should have pre-release version
        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toMatch(/^1\.1\.0-beta/);

        // versions.json should match
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['api'].version).toBe(spec.info.version);
      } finally {
        cleanup();
      }
    });
  });

  describe('AsyncAPI', () => {
    test('updates info.version in AsyncAPI spec', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'events', type: 'asyncapi', path: 'specs/events.yaml' },
        ]);

        const asyncSpec = `asyncapi: 2.6.0\ninfo:\n  title: Events API\n  version: 1.0.0\nchannels: {}\n`;
        writeFile(dir, 'specs/events.yaml', asyncSpec);
        writeFile(dir, '.contractual/snapshots/events.yaml', asyncSpec);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({ events: { version: '1.0.0', released: '2026-01-01T00:00:00Z' } })
        );

        writeFile(
          dir,
          '.contractual/changesets/event-change.md',
          `---\n"events": minor\n---\n\n## events\n- Added new channel\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/events.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.1.0');

        // Snapshot too
        const snapshot = readYAML(dir, '.contractual/snapshots/events.yaml') as {
          info: { version: string };
        };
        expect(snapshot.info.version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('ODCS', () => {
    test('updates top-level version in ODCS spec', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          { name: 'data-contract', type: 'odcs', path: 'specs/contract.yaml' },
        ]);

        const odcsSpec = `dataContractSpecification: 3.0.0\nkind: DataContract\nversion: 1.0.0\ninfo:\n  title: Sales Data\n`;
        writeFile(dir, 'specs/contract.yaml', odcsSpec);
        writeFile(dir, '.contractual/snapshots/data-contract.yaml', odcsSpec);

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'data-contract': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        writeFile(
          dir,
          '.contractual/changesets/schema-update.md',
          `---\n"data-contract": minor\n---\n\n## data-contract\n- Added new column\n`
        );

        run('version', dir);

        const spec = readYAML(dir, 'specs/contract.yaml') as { version: string };
        expect(spec.version).toBe('1.1.0');

        // Snapshot too
        const snapshot = readYAML(dir, '.contractual/snapshots/data-contract.yaml') as {
          version: string;
        };
        expect(snapshot.version).toBe('1.1.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('contract add', () => {
    test('syncs initial version into spec on contract add', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Create contractual.yaml with empty contracts
        writeFile(dir, 'contractual.yaml', 'contracts: []\n');
        writeFile(dir, '.contractual/versions.json', '{}');

        const specContent = `openapi: 3.0.3\ninfo:\n  title: API\n  version: 0.0.0\npaths: {}\n`;
        writeFile(dir, 'specs/api.yaml', specContent);

        run(
          'contract add --name my-api --type openapi --path specs/api.yaml --initial-version 1.0.0 --yes --skip-validation',
          dir
        );

        // Spec version should be set to 1.0.0
        const spec = readYAML(dir, 'specs/api.yaml') as { info: { version: string } };
        expect(spec.info.version).toBe('1.0.0');

        // Snapshot should also have it
        expect(fileExists(dir, '.contractual/snapshots/my-api.yaml')).toBe(true);
        const snapshot = readYAML(dir, '.contractual/snapshots/my-api.yaml') as {
          info: { version: string };
        };
        expect(snapshot.info.version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });
  });
});
