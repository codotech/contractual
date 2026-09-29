import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Path to the fixtures directory */
const FIXTURES_DIR = new URL('./fixtures', import.meta.url).pathname;

/**
 * Create a temp directory that auto-cleans after test
 */
export function createTempRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'contractual-e2e-'));

  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Run a contractual CLI command in the given directory
 */
export function run(
  command: string,
  cwd: string,
  options?: { expectFail?: boolean }
): { stdout: string; stderr: string; exitCode: number } {
  const fullCmd = `npx @contractual/cli ${command}`;

  try {
    const stdout = execSync(fullCmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    if (!options?.expectFail) {
      throw new Error(
        `Command failed: ${fullCmd}\n` +
          `Exit code: ${error.status}\n` +
          `stdout: ${error.stdout}\n` +
          `stderr: ${error.stderr}`
      );
    }
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

/**
 * Copy a fixture file to the temp repo
 */
export function copyFixture(fixturePath: string, destPath: string): void {
  const src = path.join(FIXTURES_DIR, fixturePath);
  const destDir = path.dirname(destPath);

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  cpSync(src, destPath);
}

/**
 * Write a file in the temp repo
 */
export function writeFile(repoDir: string, relativePath: string, content: string): void {
  const fullPath = path.join(repoDir, relativePath);
  const dir = path.dirname(fullPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(fullPath, content);
}

/**
 * Read a file from the temp repo
 */
export function readFile(repoDir: string, relativePath: string): string {
  return readFileSync(path.join(repoDir, relativePath), 'utf-8');
}

/**
 * Check if a file exists in the temp repo
 */
export function fileExists(repoDir: string, relativePath: string): boolean {
  return existsSync(path.join(repoDir, relativePath));
}

/**
 * List files in a directory within the temp repo
 */
export function listFiles(repoDir: string, relativePath: string): string[] {
  const fullPath = path.join(repoDir, relativePath);
  if (!existsSync(fullPath)) return [];
  return readdirSync(fullPath);
}

/**
 * Read and parse JSON from the temp repo
 */
export function readJSON(repoDir: string, relativePath: string): unknown {
  return JSON.parse(readFile(repoDir, relativePath));
}

/**
 * Read and parse YAML from the temp repo
 */
export function readYAML(repoDir: string, relativePath: string): unknown {
  const content = readFile(repoDir, relativePath);
  return parseYaml(content);
}

/**
 * Setup a repo with a contractual.yaml config and .contractual directory
 */
export function setupRepoWithConfig(
  repoDir: string,
  contracts: Array<{
    name: string;
    type: string;
    path: string;
  }>
): void {
  const config = {
    contracts: contracts.map((c) => ({
      name: c.name,
      type: c.type,
      path: c.path,
    })),
  };

  writeFile(repoDir, 'contractual.yaml', stringifyYaml(config));

  // Create .contractual directory structure
  mkdirSync(path.join(repoDir, '.contractual/changesets'), { recursive: true });
  mkdirSync(path.join(repoDir, '.contractual/snapshots'), { recursive: true });

  if (!fileExists(repoDir, '.contractual/versions.json')) {
    writeFile(repoDir, '.contractual/versions.json', '{}');
  }
}
