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

describe('contractual breaking', () => {
  test('no snapshot → reports first version, no breaking changes', () => {
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

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
      // First version with no snapshot shows "No changes detected"
      expect(result.stdout).toMatch(/no changes detected/i);
    } finally {
      cleanup();
    }
  });

  test('detects breaking change in JSON Schema (field removed)', () => {
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
      // Put breaking variant as current spec
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking/i);
    } finally {
      cleanup();
    }
  });

  test('detects non-breaking change (optional field added)', () => {
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
      copyFixture(
        'json-schema/order-optional-field-added.json',
        path.join(dir, 'schemas/order.json')
      );

      const result = run('breaking', dir);
      // Non-breaking = exit 0 (only breaking exits 1)
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/non-breaking|minor|no breaking/i);
    } finally {
      cleanup();
    }
  });

  test('no changes detected when spec is identical', () => {
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
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no.*change|no breaking/i);
    } finally {
      cleanup();
    }
  });

  test('--format json returns structured output', () => {
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
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      const result = run('breaking --format json', dir, { expectFail: true });
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('results');
      expect(parsed).toHaveProperty('hasBreaking');
      expect(parsed.hasBreaking).toBe(true);
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results[0]).toHaveProperty('changes');
      expect(parsed.results[0]).toHaveProperty('summary');
    } finally {
      cleanup();
    }
  });

  test('detects type change as breaking', () => {
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
      copyFixture('json-schema/order-type-changed.json', path.join(dir, 'schemas/order.json'));
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      const result = run('breaking', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/breaking|type/i);
    } finally {
      cleanup();
    }
  });

  test('--contract filters to single contract', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
        { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
      ]);

      // Set up snapshots for both
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

      // Breaking change in order, no change in user
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

      // Check only user-schema - should pass
      const result = run('breaking --contract user-schema', dir);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('breaking detection disabled for contract skips it', () => {
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
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
      // Disabled contracts show "No changes detected"
      expect(result.stdout).toMatch(/no changes detected/i);
    } finally {
      cleanup();
    }
  });
});
