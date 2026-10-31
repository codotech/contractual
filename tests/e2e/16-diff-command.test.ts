import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readFile,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual diff', () => {
  describe('basic functionality', () => {
    test('shows "no changes" when specs match snapshots', () => {
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

        const result = run('diff', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/no changes/i);
      } finally {
        cleanup();
      }
    });

    test('shows classified changes when specs differ from snapshots', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        // Current spec has a field removed (breaking change)
        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

        // Snapshot is the base version
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

        const result = run('diff', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/order-schema/i);
        expect(result.stdout).toMatch(/breaking/i);
      } finally {
        cleanup();
      }
    });

    test('always exits 0 on success regardless of breaking changes', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        // Breaking change: field removed
        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

        const result = run('diff', dir);

        // diff always exits 0 (unlike breaking which exits 1)
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/breaking/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('options', () => {
    test('--contract filters to single contract', () => {
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

        // Both have changes
        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
        copyFixture(
          'json-schema/order-optional-field-added.json',
          path.join(dir, 'schemas/user.json')
        );

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

        const result = run('diff --contract order-schema', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/order-schema/i);
        expect(result.stdout).not.toMatch(/user-schema/i);
      } finally {
        cleanup();
      }
    });

    test('--format json outputs valid JSON', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

        const result = run('diff --format json', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output).toHaveProperty('contracts');
        expect(typeof output.contracts).toBe('object');

        const contractNames = Object.keys(output.contracts);
        if (contractNames.length > 0) {
          const firstContract = output.contracts[contractNames[0]];
          expect(firstContract).toHaveProperty('changes');
          expect(firstContract).toHaveProperty('summary');
          expect(firstContract).toHaveProperty('suggestedBump');
        }
      } finally {
        cleanup();
      }
    });

    test('--severity breaking filters to only breaking changes', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        // Use a spec that has both breaking and non-breaking changes
        // For this we need a spec with field removed (breaking) and description changed (patch)
        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

        const result = run('diff --severity breaking --format json', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        // All changes in contracts should be breaking
        for (const contractName in output.contracts) {
          const contract = output.contracts[contractName];
          for (const change of contract.changes) {
            expect(change.severity).toBe('breaking');
          }
        }
      } finally {
        cleanup();
      }
    });

    test('--severity non-breaking filters to only non-breaking changes', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        // Non-breaking: optional field added
        copyFixture(
          'json-schema/order-optional-field-added.json',
          path.join(dir, 'schemas/order.json')
        );
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

        const result = run('diff --severity non-breaking --format json', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        // All changes should be non-breaking
        for (const contractName in output.contracts) {
          const contract = output.contracts[contractName];
          for (const change of contract.changes) {
            expect(change.severity).toBe('non-breaking');
          }
        }
      } finally {
        cleanup();
      }
    });

    test('--verbose shows JSON Pointer paths', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);

        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

        const result = run('diff --verbose', dir);

        expect(result.exitCode).toBe(0);
        // Verbose output should include "path:" lines
        expect(result.stdout).toMatch(/path:/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('edge cases', () => {
    test('shows "no changes" for first version (no snapshot)', () => {
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

        // No snapshot exists - first version

        const result = run('diff', dir);

        expect(result.exitCode).toBe(0);
        // Should indicate first version or no changes
        expect(result.stdout).toMatch(/no changes|first version|no snapshot/i);
      } finally {
        cleanup();
      }
    });

    test('exits with error on configuration error', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // No contractual.yaml - should fail

        const result = run('diff', dir, { expectFail: true });

        expect(result.exitCode).toBeGreaterThan(0);
        expect(result.stdout + result.stderr).toMatch(/init|config|not found/i);
      } finally {
        cleanup();
      }
    });

    test('handles contract with breaking detection disabled', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
            breaking: false, // Disabled
          },
        ]);
        copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

        const result = run('diff', dir);

        expect(result.exitCode).toBe(0);
        // Should indicate skipped or disabled
        expect(result.stdout).toMatch(/disabled|skipped|no changes/i);
      } finally {
        cleanup();
      }
    });

    test('reports error for non-existent contract name', () => {
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

        const result = run('diff --contract nonexistent', dir, { expectFail: true });

        expect(result.exitCode).toBeGreaterThan(0);
        expect(result.stdout + result.stderr).toMatch(/not found|nonexistent/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('OpenAPI contracts', () => {
    test('shows changes for OpenAPI specs', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore-api',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            lint: false, // Disable linting for petstore fixture
          },
        ]);

        // Current spec has endpoint removed (breaking)
        copyFixture(
          'openapi/petstore-breaking-endpoint-removed.yaml',
          path.join(dir, 'specs/petstore.yaml')
        );

        // Snapshot is base version
        copyFixture(
          'openapi/petstore-base.yaml',
          path.join(dir, '.contractual/snapshots/petstore-api.yaml')
        );

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'petstore-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        const result = run('diff', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/petstore-api/i);
        expect(result.stdout).toMatch(/breaking/i);
      } finally {
        cleanup();
      }
    });
  });
});

describe('breaking command after refactor', () => {
  test('still exits 1 on breaking changes', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

      const result = run('breaking', dir, { expectFail: true });

      expect(result.exitCode).toBe(1);
    } finally {
      cleanup();
    }
  });

  test('still exits 0 when no breaking changes', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // Non-breaking change only
      copyFixture(
        'json-schema/order-optional-field-added.json',
        path.join(dir, 'schemas/order.json')
      );
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

      const result = run('breaking', dir);

      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });
});

describe('changeset command after refactor', () => {
  test('still generates changeset from detected changes', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
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

      const result = run('changeset', dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/created changeset/i);
    } finally {
      cleanup();
    }
  });

  test('still shows "no changes" when specs match', () => {
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

      const result = run('changeset', dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/no change/i);
    } finally {
      cleanup();
    }
  });
});
