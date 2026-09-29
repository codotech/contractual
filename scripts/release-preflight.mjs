import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const tag = process.env.DIST_TAG;
assert.ok(['latest', 'next', 'dev', 'rc', 'alpha', 'beta'].includes(tag), 'Invalid distribution tag');
assert.ok(process.env.NODE_AUTH_TOKEN, 'NPM_TOKEN is required; ask Omer to configure package write access');
const npm = args => execFileSync('npm', args, { encoding: 'utf8' }).trim();
const username = npm(['whoami', '--registry=https://registry.npmjs.org/']);
const access = JSON.parse(npm(['access', 'list', 'packages', username, '--json']));
for (const directory of readdirSync('packages')) {
  const pkg = JSON.parse(readFileSync(`packages/${directory}/package.json`, 'utf8'));
  if (pkg.private) continue;
  assert.equal(pkg.repository?.url, 'https://github.com/codotech/contractual.git', `${pkg.name}: repository URL must match provenance`);
  assert.equal(pkg.publishConfig?.access, 'public', `${pkg.name}: public access must be explicit`);
  assert.equal(access[pkg.name], 'read-write', `${username} cannot publish ${pkg.name}; verify npm token permissions`);
  assert.ok(tag !== 'latest' || !pkg.version.includes('-'), `${pkg.name}: refusing a prerelease on latest`);
  console.log(`${pkg.name}@${pkg.version}: publishing preflight passed (${tag})`);
}
