import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  existsSync,
  writeFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Path to the built CLI binary */
const CLI_BIN = path.resolve(__dirname, '../../packages/cli/bin/cli.js');

/** Path to the fixtures directory */
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

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
 * Create a temp directory WITH git initialized (for tests that need git commits)
 */
export function createTempGitRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'contractual-e2e-'));

  // Initialize git repo with explicit error handling
  try {
    execSync('git init --initial-branch=main', { cwd: dir, encoding: 'utf-8' });
    execSync('git config user.email "test@test.com"', { cwd: dir, encoding: 'utf-8' });
    execSync('git config user.name "Test User"', { cwd: dir, encoding: 'utf-8' });
  } catch (err) {
    // Clean up on failure
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    const error = err as Error & { stderr?: string };
    throw new Error(`Failed to initialize git repo: ${error.message}\n${error.stderr ?? ''}`);
  }

  // Verify .git directory exists
  if (!existsSync(path.join(dir, '.git'))) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Git init succeeded but .git directory not found in ${dir}`);
  }

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
  options?: { expectFail?: boolean; env?: Record<string, string>; timeout?: number }
): { stdout: string; stderr: string; exitCode: number } {
  const fullCmd = `node "${CLI_BIN}" ${command}`;

  try {
    const stdout = execSync(fullCmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options?.timeout,
      env: { ...process.env, ...options?.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    if (!options?.expectFail) {
      // Unexpected failure — include output for debugging
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
 * Copy fixture files into the temp repo
 */
export function copyFixtures(fixtureDir: string, destDir: string): void {
  const srcDir = path.join(FIXTURES_DIR, fixtureDir);
  cpSync(srcDir, destDir, { recursive: true });
}

/**
 * Copy a single fixture file
 */
export function copyFixture(fixturePath: string, destPath: string): void {
  const src = path.join(FIXTURES_DIR, fixturePath);
  const destDir = path.dirname(destPath);

  // Ensure destination directory exists
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  cpSync(src, destPath);
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
 * Git commit all changes in the temp repo
 */
export function gitCommitAll(repoDir: string, message: string): void {
  // Verify .git directory exists
  if (!existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`gitCommitAll: Not a git repository: ${repoDir}`);
  }

  try {
    execSync('git add -A', { cwd: repoDir, encoding: 'utf-8' });
    execSync(`git commit -m "${message}" --allow-empty`, { cwd: repoDir, encoding: 'utf-8' });
  } catch (err) {
    const error = err as Error & { stderr?: string; stdout?: string };
    throw new Error(
      `gitCommitAll failed in ${repoDir}: ${error.message}\nstderr: ${error.stderr ?? ''}\nstdout: ${error.stdout ?? ''}`
    );
  }
}

/**
 * Modify a YAML file (read, transform, write back)
 */
export function modifyYAML(
  repoDir: string,
  relativePath: string,
  transform: (content: unknown) => unknown
): void {
  const content = parseYaml(readFile(repoDir, relativePath));
  const modified = transform(content);
  writeFile(repoDir, relativePath, stringifyYaml(modified as Record<string, unknown>));
}

/**
 * Modify a JSON file (read, transform, write back)
 */
export function modifyJSON(
  repoDir: string,
  relativePath: string,
  transform: (content: unknown) => unknown
): void {
  const content = readJSON(repoDir, relativePath);
  const modified = transform(content);
  writeFile(repoDir, relativePath, JSON.stringify(modified, null, 2) + '\n');
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
    lint?: string | false;
    breaking?: string | false;
    syncVersion?: boolean;
  }>
): void {
  const config = {
    contracts: contracts.map((c) => ({
      name: c.name,
      type: c.type,
      path: c.path,
      ...(c.lint !== undefined ? { lint: c.lint } : {}),
      ...(c.breaking !== undefined ? { breaking: c.breaking } : {}),
      ...(c.syncVersion !== undefined ? { syncVersion: c.syncVersion } : {}),
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

/**
 * Check if oasdiff is available on the system
 */
export function checkOasdiff(): boolean {
  try {
    execSync('oasdiff --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure CLI is built before running tests
 */
export function ensureCliBuilt(): void {
  if (!existsSync(CLI_BIN)) {
    throw new Error(
      `CLI binary not found at ${CLI_BIN}. Run 'pnpm build' in the root directory first.`
    );
  }

  // Also check that the dist directory has the commands.js file
  const commandsPath = path.resolve(__dirname, '../../packages/cli/dist/commands.js');
  if (!existsSync(commandsPath)) {
    throw new Error(
      `CLI not built properly. dist/commands.js not found. Run 'pnpm build' in the root directory.`
    );
  }
}
