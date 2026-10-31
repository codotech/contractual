import { execSync, type ExecSyncOptions } from 'node:child_process';

/**
 * Result of executing a command
 */
export interface ExecResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code */
  exitCode: number;
}

/**
 * Error shape from execSync when command fails
 */
interface ExecSyncError {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
  status?: number;
}

/**
 * Type guard for execSync errors
 */
function isExecSyncError(err: unknown): err is ExecSyncError {
  return (
    typeof err === 'object' &&
    err !== null &&
    ('status' in err || 'stdout' in err || 'stderr' in err)
  );
}

/**
 * Substitute placeholders in a command string
 */
export function substitutePlaceholders(
  command: string,
  substitutions: Record<string, string>
): string {
  let result = command;
  for (const [key, value] of Object.entries(substitutions)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Check if a string contains placeholders
 */
export function hasPlaceholders(command: string): boolean {
  return /\{(spec|old|new)\}/.test(command);
}

/**
 * Execute a command and return the result
 */
export function execCommand(
  command: string,
  substitutions: Record<string, string> = {},
  options: ExecSyncOptions = {}
): ExecResult {
  const resolvedCommand = substitutePlaceholders(command, substitutions);

  try {
    const stdout = execSync(resolvedCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }) as string;
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    if (isExecSyncError(err)) {
      const stdout = typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString() ?? '');
      const stderr = typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString() ?? '');
      return {
        stdout,
        stderr,
        exitCode: err.status ?? 1,
      };
    }
    // Unknown error type - return generic failure
    return {
      stdout: '',
      stderr: err instanceof Error ? err.message : 'Unknown error',
      exitCode: 1,
    };
  }
}

/**
 * Execute a command and throw if it fails
 */
export function execCommandOrThrow(
  command: string,
  substitutions: Record<string, string> = {},
  options: ExecSyncOptions = {}
): string {
  const result = execCommand(command, substitutions, options);
  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`);
  }
  return result.stdout;
}
