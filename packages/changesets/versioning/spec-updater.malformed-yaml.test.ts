import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { updateSpecVersion } from './spec-updater.js';

const dir = mkdtempSync(join(tmpdir(), 'spec-updater-'));

function write(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

afterEach(() => vi.restoreAllMocks());

describe('updateSpecVersion - malformed YAML', () => {
  // A multi-line single-quoted scalar with under-indented continuation lines produces
  // recoverable parse errors: the document parses, but Document.toString() refuses to
  // serialize it. The version field itself sits in a clean region of the file.
  const malformed = `info:
  title: Example SDK
  version: 3.2.0
paths:
  /x:
    get:
      parameters:
        - description: 'The agent extracts structured data from individual pages
          on the site. Ideal for tracking pricing and catalog changes.

          '
          name: agent
`;

  it('does not throw, and syncs info.version in place despite parse errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = write('public.yaml', malformed);

    const changed = updateSpecVersion(p, '9.9.9', 'openapi');

    expect(changed).toBe(true);
    const after = readFileSync(p, 'utf-8');
    expect(parseDocument(after).getIn(['info', 'version'])).toBe('9.9.9');
    // malformed region is preserved byte-for-byte (only the version line differs)
    expect(after).toContain('on the site. Ideal for tracking pricing');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('still works the normal way on a clean spec', () => {
    const p = write('clean.yaml', 'info:\n  title: X\n  version: 1.0.0\n');
    const changed = updateSpecVersion(p, '2.0.0', 'openapi');
    expect(changed).toBe(true);
    expect(parseDocument(readFileSync(p, 'utf-8')).getIn(['info', 'version'])).toBe('2.0.0');
  });

  it('keeps a numeric-looking version a string (1.0 stays quoted-safe)', () => {
    const p = write('numeric.yaml', 'info:\n  title: X\n  version: 3.0.0\n');
    updateSpecVersion(p, '1.0', 'openapi');
    expect(parseDocument(readFileSync(p, 'utf-8')).getIn(['info', 'version'])).toBe('1.0');
  });
});
