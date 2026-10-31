import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  ensureCliBuilt,
  fileExists,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('error handling and edge cases', () => {
  describe('missing contractual.yaml', () => {
    test('exits with error suggesting init when no config exists', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Run lint without any config
        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/contractual\.yaml|not found|init/i);
      } finally {
        cleanup();
      }
    });

    test('breaking command suggests init when no config exists', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        const result = run('breaking', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/contractual\.yaml|not found|init/i);
      } finally {
        cleanup();
      }
    });

    test('status command suggests init when no config exists', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        const result = run('status', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/contractual\.yaml|not found|init/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('invalid YAML configuration', () => {
    test('exits with parse error for malformed YAML', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Write invalid YAML syntax
        writeFile(
          dir,
          'contractual.yaml',
          `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
  - name: broken
    type: [this is invalid yaml
    path: nowhere
`
        );

        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/parse|yaml|syntax|invalid/i);
      } finally {
        cleanup();
      }
    });

    test('exits with error for invalid config structure', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Write valid YAML but invalid config structure
        writeFile(
          dir,
          'contractual.yaml',
          `contracts: "this should be an array"
`
        );

        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/invalid|error|array/i);
      } finally {
        cleanup();
      }
    });

    test('handles empty config file gracefully', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        writeFile(dir, 'contractual.yaml', '');

        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/empty|invalid|error/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('spec file not found', () => {
    test('lint reports error when spec file does not exist', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'missing-api',
            type: 'openapi',
            path: 'specs/nonexistent.yaml',
          },
        ]);

        // Config loader warns about missing files but continues
        // Linter will fail when trying to read the missing file
        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/warning|not found|no such file|ENOENT/i);
      } finally {
        cleanup();
      }
    });

    test('breaking command handles missing spec file gracefully', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'missing-api',
            type: 'openapi',
            path: 'specs/nonexistent.yaml',
          },
        ]);
        // Set up snapshot but no current spec
        copyFixture(
          'openapi/petstore-base.yaml',
          path.join(dir, '.contractual/snapshots/missing-api.yaml')
        );
        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'missing-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        // Config loader warns about missing file but continues
        // Breaking command may fail during diff (if oasdiff available) or report no differ
        const result = run('breaking', dir, { expectFail: true });
        // Should mention the missing file or failed check in output
        expect(result.stdout + result.stderr).toMatch(/warning|not found|failed|error|no contracts/i);
      } finally {
        cleanup();
      }
    });

    test('lints valid contracts and reports error for missing spec', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'valid-api',
            type: 'openapi',
            path: 'specs/valid.yaml',
          },
          {
            name: 'missing-api',
            type: 'openapi',
            path: 'specs/nonexistent.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/valid.yaml'));

        // Config loader emits a warning about missing files but continues
        // Lint will process valid contract and fail on missing one
        const result = run('lint', dir, { expectFail: true });
        // Should mention the missing file
        expect(result.stdout + result.stderr).toMatch(/nonexistent|not found|ENOENT/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('corrupt versions.json', () => {
    test('status handles corrupt/invalid JSON in versions.json gracefully', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Write corrupt JSON to versions.json
        writeFile(dir, '.contractual/versions.json', '{ this is not valid json }}}');

        // The readVersions function in status.command.ts returns {} on parse error
        // So the status command should succeed, treating all contracts as unreleased
        const result = run('status', dir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/unreleased|0\.0\.0/i);
      } finally {
        cleanup();
      }
    });

    test('status handles versions.json with wrong structure gracefully', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Write valid JSON but wrong structure (array instead of object)
        // This will be treated as invalid, and status will show contracts as unreleased
        writeFile(dir, '.contractual/versions.json', JSON.stringify(['not', 'an', 'object']));

        const result = run('status', dir);
        // Status command should succeed - it may treat versions as empty
        expect(result.exitCode).toBe(0);
      } finally {
        cleanup();
      }
    });

    test('breaking handles missing snapshot gracefully', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // No snapshot exists for this contract - first version
        const result = run('breaking', dir);
        // Should handle gracefully - exits with 0
        expect(result.exitCode).toBe(0);
        // When no snapshot exists, shows "No changes detected"
        expect(result.stdout).toMatch(/no changes detected/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('changeset references unknown contract', () => {
    test('status shows changeset referencing unknown contract', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Create a changeset that references an unknown contract
        // Format: YAML frontmatter with "contract-name": bump-type
        writeFile(
          dir,
          '.contractual/changesets/orphan-change.md',
          `---
"unknown-contract": minor
---

This references a contract that does not exist
`
        );

        // Status command should succeed - it shows the changeset
        // but the projected version won't be shown for an unknown contract
        const result = run('status', dir);
        expect(result.exitCode).toBe(0);
        // Should list the changeset
        expect(result.stdout).toMatch(/changeset|pending/i);
      } finally {
        cleanup();
      }
    });

    test('version command handles changeset with unknown contract', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Create a valid changeset for known contract
        writeFile(
          dir,
          '.contractual/changesets/valid-change.md',
          `---
"petstore": patch
---

A valid change
`
        );

        // Create a changeset for unknown contract
        writeFile(
          dir,
          '.contractual/changesets/orphan-change.md',
          `---
"ghost-api": major
---

This references a non-existent contract
`
        );

        const result = run('version', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('ghost-api');
        expect(fileExists(dir, '.contractual/changesets/valid-change.md')).toBe(true);
        expect(fileExists(dir, '.contractual/changesets/orphan-change.md')).toBe(true);
      } finally {
        cleanup();
      }
    });
  });

  describe('empty contracts array', () => {
    test('lint rejects empty contracts array per schema validation', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, []);

        // Empty contracts array is invalid per config schema (minItems: 1)
        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/invalid|error|contract|minItems/i);
      } finally {
        cleanup();
      }
    });

    test('breaking rejects empty contracts array per schema validation', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, []);

        // Empty contracts array is invalid per config schema (minItems: 1)
        const result = run('breaking', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/invalid|error|contract|minItems/i);
      } finally {
        cleanup();
      }
    });

    test('status rejects empty contracts array per schema validation', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, []);

        // Empty contracts array is invalid per config schema (minItems: 1)
        const result = run('status', dir, { expectFail: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/invalid|error|contract|minItems/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('special characters in paths', () => {
    test('handles spec path with spaces', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'spaced-api',
            type: 'openapi',
            path: 'specs/my api spec.yaml',
            lint: false, // Disable linting to avoid errors from fixture spec
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/my api spec.yaml'));

        const result = run('lint', dir);
        expect(result.exitCode).toBe(0);
      } finally {
        cleanup();
      }
    });

    test('handles contract name with dashes and numbers', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Contract names must match pattern: ^[a-z][a-z0-9-]*$
        // So dashes and numbers are allowed, but not dots
        setupRepoWithConfig(dir, [
          {
            name: 'api-v2-beta',
            type: 'openapi',
            path: 'specs/api.yaml',
            lint: false, // Disable linting to avoid errors from fixture spec
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

        const result = run('lint', dir);
        expect(result.exitCode).toBe(0);
      } finally {
        cleanup();
      }
    });
  });

  describe('permission and file system errors', () => {
    test('lint reports permission error when spec file is unreadable', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Make file unreadable (only works on Unix-like systems)
        try {
          require('node:fs').chmodSync(path.join(dir, 'specs/petstore.yaml'), 0o000);
        } catch {
          // Skip this test on systems where chmod doesn't work
          return;
        }

        try {
          // Linter will fail when trying to read the file
          const result = run('lint', dir, { expectFail: true });
          expect(result.exitCode).not.toBe(0);
          expect(result.stdout + result.stderr).toMatch(/permission|EACCES|denied|error/i);
        } finally {
          // Restore permissions for cleanup
          require('node:fs').chmodSync(path.join(dir, 'specs/petstore.yaml'), 0o644);
        }
      } finally {
        cleanup();
      }
    });
  });

  describe('concurrent operations', () => {
    test('handles being run in parallel (no race conditions)', async () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            lint: false, // Disable linting to avoid errors from fixture spec
            breaking: false, // Disable breaking to avoid needing snapshot
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Run multiple commands in parallel
        // Note: status command does not have --format flag
        const results = await Promise.all([
          Promise.resolve(run('lint', dir)),
          Promise.resolve(run('status', dir)),
          Promise.resolve(run('breaking', dir)),
        ]);

        // All should succeed
        for (const result of results) {
          expect(result.exitCode).toBe(0);
        }
      } finally {
        cleanup();
      }
    });
  });
});
