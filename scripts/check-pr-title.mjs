import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../packages/', import.meta.url));
const scopes = readdirSync(directory).map(name =>
  JSON.parse(readFileSync(join(directory, name, 'package.json'), 'utf8')).name.replace('@contractual/', '')
);
scopes.push('*');
const title = process.env.PR_TITLE || '';
const match = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\(([^)]+)\))?!?: \S[^\r\n]*$/.exec(title);
if (!match || (match[2] && !scopes.includes(match[2]))) {
  console.error(`Use a Conventional Commit title with a workspace scope (${scopes.join(', ')}), or no scope for a repository-wide change. Example: fix(cli): handle missing snapshots`);
  process.exit(1);
}
