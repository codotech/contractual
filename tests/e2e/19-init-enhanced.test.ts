import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  writeFile,
  readJSON,
  readYAML,
  fileExists,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual init (enhanced)', () => {
  describe('version options', () => {
    test('--initial-version sets starting version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Create a spec file
        copyFixture('json-schema/order-base.json', path.join(dir, 'order.schema.json'));

        const result = run('init --initial-version 1.5.0 -y', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/v1\.5\.0/);

        // Verify versions.json
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        const contractName = Object.keys(versions)[0];
        expect(versions[contractName].version).toBe('1.5.0');
      } finally {
        cleanup();
      }
    });

    test('-y uses default version (0.0.0)', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        copyFixture('json-schema/order-base.json', path.join(dir, 'order.schema.json'));

        const result = run('init -y', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/v0\.0\.0/);

        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        const contractName = Object.keys(versions)[0];
        expect(versions[contractName].version).toBe('0.0.0');
      } finally {
        cleanup();
      }
    });

    test('creates snapshots at initial version', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        copyFixture('json-schema/order-base.json', path.join(dir, 'order.schema.json'));

        run('init --initial-version 2.0.0 -y', dir);

        // Verify snapshot was created
        expect(fileExists(dir, '.contractual/snapshots')).toBe(true);

        // Find snapshot file
        const config = readYAML(dir, 'contractual.yaml') as {
          contracts: Array<{ name: string }>;
        };
        const contractName = config.contracts[0].name;

        // Snapshot should exist (extension may vary)
        const snapshotExists =
          fileExists(dir, `.contractual/snapshots/${contractName}.json`) ||
          fileExists(dir, `.contractual/snapshots/${contractName}.yaml`);
        expect(snapshotExists).toBe(true);
      } finally {
        cleanup();
      }
    });
  });

  describe('versioning modes', () => {
    test('--versioning independent (default)', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        copyFixture('json-schema/order-base.json', path.join(dir, 'order.schema.json'));

        const result = run('init --versioning independent -y', dir);

        expect(result.exitCode).toBe(0);

        // Independent mode should not add versioning section (it's the default)
        const config = readYAML(dir, 'contractual.yaml') as {
          versioning?: { mode: string };
        };
        // Default mode doesn't need explicit config
        expect(config.versioning?.mode).toBeUndefined();
      } finally {
        cleanup();
      }
    });

    test('--versioning fixed', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        copyFixture('json-schema/order-base.json', path.join(dir, 'order.schema.json'));

        const result = run('init --versioning fixed -y', dir);

        expect(result.exitCode).toBe(0);

        const config = readYAML(dir, 'contractual.yaml') as {
          versioning?: { mode: string };
        };
        expect(config.versioning?.mode).toBe('fixed');
      } finally {
        cleanup();
      }
    });
  });

  describe('--force flag', () => {
    test('reinitializes existing project', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        copyFixture('json-schema/order-base.json', path.join(dir, 'order.schema.json'));

        // First init
        run('init --initial-version 1.0.0 -y', dir);

        // Verify first init
        let versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        const contractName = Object.keys(versions)[0];
        expect(versions[contractName].version).toBe('1.0.0');

        // Force reinit with different version
        const result = run('init --initial-version 2.0.0 --force -y', dir);

        expect(result.exitCode).toBe(0);

        // Verify reinit
        versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions[contractName].version).toBe('2.0.0');
      } finally {
        cleanup();
      }
    });
  });

  describe('existing project handling', () => {
    test('initializes unversioned contracts in existing project', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Create config manually with two contracts
        writeFile(
          dir,
          'contractual.yaml',
          `contracts:
  - name: order-schema
    type: json-schema
    path: schemas/order.json
  - name: user-schema
    type: json-schema
    path: schemas/user.json
`
        );

        // Create spec files
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

        // Create .contractual dir with only one contract versioned
        writeFile(dir, '.contractual/versions.json', '{}');

        // Run init - should detect unversioned contracts
        const result = run('init -y', dir);

        expect(result.exitCode).toBe(0);
        // Should mention finding unversioned contracts
        expect(result.stdout).toMatch(/without version|uninitialized|initialized/i);
      } finally {
        cleanup();
      }
    });

    test('skips already versioned contracts', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Create config
        writeFile(
          dir,
          'contractual.yaml',
          `contracts:
  - name: order-schema
    type: json-schema
    path: schemas/order.json
`
        );

        // Create spec and snapshot
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

        // Run init - should recognize all contracts have snapshots
        const result = run('init -y', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/already initialized|all contracts have snapshots/i);
      } finally {
        cleanup();
      }
    });
  });
});
