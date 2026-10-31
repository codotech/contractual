import { execSync } from 'node:child_process';
import { describe, test, expect } from 'vitest';

function run(command: string): string {
  return execSync(command, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
}

describe('CLI Installation and Basic Commands', () => {
  test('contractual binary is available after npm install', () => {
    const result = run('npx @contractual/cli --version');
    expect(result).toMatch(/\d+\.\d+\.\d+/);
  });

  test('contractual --help shows available commands', () => {
    const result = run('npx @contractual/cli --help');
    expect(result).toContain('init');
    expect(result).toContain('lint');
    expect(result).toContain('diff');
    expect(result).toContain('breaking');
    expect(result).toContain('changeset');
    expect(result).toContain('version');
    expect(result).toContain('status');
    expect(result).toContain('contract');
    expect(result).toContain('pre');
  });

  test('contractual init --help shows init options', () => {
    const result = run('npx @contractual/cli init --help');
    expect(result.toLowerCase()).toContain('initialize');
  });

  test('contractual lint --help shows lint options', () => {
    const result = run('npx @contractual/cli lint --help');
    expect(result).toContain('--format');
  });

  test('contractual breaking --help shows breaking options', () => {
    const result = run('npx @contractual/cli breaking --help');
    expect(result).toContain('--format');
  });

  test('contractual diff --help shows diff options', () => {
    const result = run('npx @contractual/cli diff --help');
    expect(result).toContain('--format');
    expect(result).toContain('--severity');
    expect(result).toContain('--verbose');
  });

  test('contractual contract --help shows subcommands', () => {
    const result = run('npx @contractual/cli contract --help');
    expect(result).toContain('add');
    expect(result).toContain('list');
  });

  test('contractual contract add --help shows add options', () => {
    const result = run('npx @contractual/cli contract add --help');
    expect(result).toContain('--name');
    expect(result).toContain('--type');
    expect(result).toContain('--path');
  });

  test('contractual pre --help shows subcommands', () => {
    const result = run('npx @contractual/cli pre --help');
    expect(result).toContain('enter');
    expect(result).toContain('exit');
    expect(result).toContain('status');
  });

  test('contractual version --help shows version options', () => {
    const result = run('npx @contractual/cli version --help');
    expect(result).toContain('--dry-run');
    expect(result).toContain('--json');
    expect(result).toContain('--yes');
  });
});
