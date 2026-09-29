import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'contractual-pack-check-'));
const run = (command, args, cwd = directory) => execFileSync(command, args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  const packages = readdirSync(join(root, 'packages')).map(name => {
    const path = join(root, 'packages', name);
    return { path, ...JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) };
  }).filter(pkg => !pkg.private);
  const dependencies = {};
  for (const pkg of packages) {
    run('pnpm', ['pack', '--pack-destination', directory], pkg.path);
    const filename = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
    const tarball = join(directory, filename);
    const contents = run('tar', ['-tzf', tarball]);
    assert.match(contents, /package\/dist\/index.js/);
    assert.doesNotMatch(contents, /\.(test|spec)\.[cm]?[jt]s(?:\n|$)/);
    const packed = JSON.parse(run('tar', ['-xOzf', tarball, 'package/package.json']));
    for (const version of Object.values(packed.dependencies || {})) {
      assert.ok(!version.startsWith('workspace:'), `${pkg.name} contains a workspace dependency`);
    }
    dependencies[pkg.name] = `file:${tarball}`;
  }
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    private: true, type: 'module', dependencies, overrides: dependencies,
  }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false']);
  run('node', ['--input-type=module', '-e',
    `for (const name of ${JSON.stringify(Object.keys(dependencies))}) await import(name);`]);
  const cli = resolve(directory, 'node_modules/@contractual/cli/bin/cli.js');
  assert.match(run('node', [cli, '--help']), /changeset/);
  writeFileSync(join(directory, 'order.schema.json'), JSON.stringify({
    $schema: 'http://json-schema.org/draft-07/schema#', type: 'object',
    properties: { id: { type: 'string' } },
  }));
  run('node', [cli, 'init', '--yes']);
  run('node', [cli, 'lint']);
  run('node', [cli, 'diff', '--format', 'json']);
  run('node', [cli, 'status']);
  console.log(`Packed, installed, imported and smoke-tested ${packages.length} packages.`);
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
