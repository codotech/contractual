import { test, expect } from 'vitest';
import { createTempRepo, writeFile, run, fileExists, readFile } from './helpers.js';

test('fixed versioning fails before modifying versions or consuming changesets', () => {
  const { dir, cleanup } = createTempRepo();
  try {
    writeFile(
      dir,
      'contractual.yaml',
      'contracts:\n  - name: api\n    type: json-schema\n    path: api.json\nversioning:\n  mode: fixed\n'
    );
    writeFile(dir, 'api.json', '{"type":"object"}');
    writeFile(dir, '.contractual/versions.json', '{"api":{"version":"1.0.0"}}');
    writeFile(dir, '.contractual/changesets/change.md', '---\napi: minor\n---\nChange\n');
    const result = run('version --yes', dir, { expectFail: true });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Fixed versioning is not implemented');
    expect(readFile(dir, '.contractual/versions.json')).toBe('{"api":{"version":"1.0.0"}}');
    expect(fileExists(dir, '.contractual/changesets/change.md')).toBe(true);
  } finally {
    cleanup();
  }
});

test('a missing built-in engine cannot report a successful lint or diff', () => {
  const { dir, cleanup } = createTempRepo();
  try {
    writeFile(
      dir,
      'contractual.yaml',
      'contracts:\n  - name: events\n    type: asyncapi\n    path: events.yaml\n'
    );
    writeFile(dir, 'events.yaml', 'asyncapi: 3.0.0\ninfo:\n  title: Events\n  version: 1.0.0\n');
    writeFile(dir, '.contractual/versions.json', '{"events":{"version":"1.0.0"}}');
    writeFile(dir, '.contractual/snapshots/events.yaml', 'asyncapi: 3.0.0\n');
    expect(run('lint --format json', dir, { expectFail: true }).exitCode).not.toBe(0);
    expect(run('diff', dir, { expectFail: true }).exitCode).not.toBe(0);
  } finally {
    cleanup();
  }
});
