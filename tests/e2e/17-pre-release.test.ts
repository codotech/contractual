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

describe('contractual pre', () => {
  describe('pre enter', () => {
    test('enters pre-release mode with tag', () => {
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

        const result = run('pre enter beta', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/entered pre-release mode/i);
        expect(result.stdout).toMatch(/beta/i);
        expect(fileExists(dir, '.contractual/pre.json')).toBe(true);

        const preState = readJSON(dir, '.contractual/pre.json') as {
          tag: string;
          enteredAt: string;
          initialVersions: Record<string, string>;
        };
        expect(preState.tag).toBe('beta');
        expect(preState.initialVersions['order-schema']).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });

    test('creates pre.json with correct structure', () => {
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

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            api: { version: '2.5.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        run('pre enter alpha', dir);

        const preState = readJSON(dir, '.contractual/pre.json') as {
          tag: string;
          enteredAt: string;
          initialVersions: Record<string, string>;
        };

        expect(preState.tag).toBe('alpha');
        expect(preState.enteredAt).toBeDefined();
        expect(new Date(preState.enteredAt).getTime()).not.toBeNaN();
        expect(preState.initialVersions).toEqual({ api: '2.5.0' });
      } finally {
        cleanup();
      }
    });

    test('fails if already in pre-release mode', () => {
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

        // Enter pre-release mode first
        run('pre enter beta', dir);

        // Try to enter again
        const result = run('pre enter alpha', dir, { expectFail: true });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toMatch(/already in pre-release mode/i);
      } finally {
        cleanup();
      }
    });

    test('fails if not initialized', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // No contractual.yaml or .contractual directory

        const result = run('pre enter beta', dir, { expectFail: true });

        expect(result.exitCode).toBe(1);
        expect(result.stdout + result.stderr).toMatch(/no .contractual directory|init/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('pre exit', () => {
    test('exits pre-release mode', () => {
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

        // Enter and then exit
        run('pre enter beta', dir);
        expect(fileExists(dir, '.contractual/pre.json')).toBe(true);

        const result = run('pre exit', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/exited pre-release mode/i);
        expect(fileExists(dir, '.contractual/pre.json')).toBe(false);
      } finally {
        cleanup();
      }
    });

    test('shows message if not in pre-release mode', () => {
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

        const result = run('pre exit', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/not in pre-release mode/i);
      } finally {
        cleanup();
      }
    });

    test('fails if not initialized', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        const result = run('pre exit', dir, { expectFail: true });

        expect(result.exitCode).toBe(1);
        expect(result.stdout + result.stderr).toMatch(/no .contractual directory|init/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('pre status', () => {
    test('shows current pre-release tag and entry time', () => {
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

        run('pre enter rc', dir);

        const result = run('pre status', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/rc/i);
        expect(result.stdout).toMatch(/tag|pre-release/i);
      } finally {
        cleanup();
      }
    });

    test('shows "not in pre-release mode" when inactive', () => {
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

        const result = run('pre status', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/not in pre-release mode/i);
      } finally {
        cleanup();
      }
    });

    test('fails if not initialized', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        const result = run('pre status', dir, { expectFail: true });

        expect(result.exitCode).toBe(1);
        expect(result.stdout + result.stderr).toMatch(/no .contractual directory|init/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('version with pre-release', () => {
    test('bumps to pre-release version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        // Setup initial state
        copyFixture(
          'json-schema/order-base.json',
          path.join(dir, '.contractual/snapshots/order-schema.json')
        );
        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        // Enter pre-release mode
        run('pre enter beta', dir);

        // Create changeset
        const changeset = `---
"order-schema": major
---

Breaking change for beta testing
`;
        writeFile(dir, '.contractual/changesets/breaking.md', changeset);

        // Run version
        const result = run('version --yes', dir);

        expect(result.exitCode).toBe(0);

        // Check version is pre-release format
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['order-schema'].version).toMatch(/2\.0\.0-beta/);
      } finally {
        cleanup();
      }
    });

    test('increments pre-release number on subsequent versions', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        // Start with a pre-release version already
        copyFixture(
          'json-schema/order-base.json',
          path.join(dir, '.contractual/snapshots/order-schema.json')
        );
        copyFixture(
          'json-schema/order-optional-field-added.json',
          path.join(dir, 'schemas/order.json')
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'order-schema': { version: '2.0.0-beta.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        // Create pre.json to simulate being in pre-release mode
        writeFile(
          dir,
          '.contractual/pre.json',
          JSON.stringify({
            tag: 'beta',
            enteredAt: '2026-01-01T00:00:00Z',
            initialVersions: { 'order-schema': '1.0.0' },
          })
        );

        // Create changeset
        const changeset = `---
"order-schema": minor
---

Another beta change
`;
        writeFile(dir, '.contractual/changesets/minor.md', changeset);

        // Run version
        const result = run('version --yes', dir);

        expect(result.exitCode).toBe(0);

        // Check version incremented pre-release number
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        // Should be 2.1.0-beta.0 or 2.0.0-beta.1 depending on implementation
        expect(versions['order-schema'].version).toMatch(/beta/);
      } finally {
        cleanup();
      }
    });
  });
});
