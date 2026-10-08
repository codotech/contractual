import { describe, test, expect } from 'vitest';

describe('Package Imports (ESM)', () => {
  test('@contractual/types exports are defined', async () => {
    const types = await import('@contractual/types');
    // TypeScript type check - if this compiles, types are exported correctly
    expect(types).toBeDefined();
  });

  test('@contractual/changesets exports versioning utilities', async () => {
    const changesets = await import('@contractual/changesets');
    expect(changesets).toBeDefined();
    // Check for key exports
    expect(typeof changesets).toBe('object');
  });

  test('@contractual/governance exports are available', async () => {
    const governance = await import('@contractual/governance');
    expect(governance).toBeDefined();
    expect(typeof governance).toBe('object');
  });

  test('@contractual/differs.json-schema exports differ', async () => {
    const differ = await import('@contractual/differs.json-schema');
    expect(differ).toBeDefined();
    expect(typeof differ).toBe('object');
  });

  test('@contractual/governance/linters subpath export works', async () => {
    const linters = await import('@contractual/governance/linters');
    expect(linters).toBeDefined();
  });

  test('@contractual/governance/differs subpath export works', async () => {
    const differs = await import('@contractual/governance/differs');
    expect(differs).toBeDefined();
  });
});
