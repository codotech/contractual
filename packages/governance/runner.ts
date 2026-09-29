/**
 * Custom Command Runner
 *
 * Executes user-defined governance commands and parses their output.
 */

import { execSync } from 'node:child_process';
import type { LintResult, DiffResult, LintIssue, Change } from '@contractual/types';

/**
 * Shape of exec error with additional properties
 */
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
  status?: number;
  signal?: string;
}

/**
 * Type guard for ExecError
 */
function isExecError(error: unknown): error is ExecError {
  return error instanceof Error;
}

/**
 * Execute a custom command and return its output
 *
 * Note: This function is async for API consistency with other governance functions,
 * even though the underlying execSync is synchronous. This allows for future
 * migration to async child_process.spawn if needed.
 *
 * @param command - Command to execute
 * @param timeout - Timeout in milliseconds (default: 60000)
 * @returns Command stdout
 * @throws Error if command fails
 */
export async function executeCustomCommand(command: string, timeout = 60000): Promise<string> {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return stdout;
  } catch (error: unknown) {
    // Type-safe error handling
    if (isExecError(error)) {
      // Some tools exit with non-zero when issues found - return stdout if available
      if (error.stdout) {
        return error.stdout;
      }

      throw new Error(
        `Custom command failed: ${command}\n` +
          `Exit code: ${error.status ?? 'unknown'}\n` +
          `Stderr: ${error.stderr ?? error.message}`
      );
    }

    throw new Error(`Custom command failed: ${command}\n${String(error)}`);
  }
}

/**
 * Parse custom lint command output into LintResult
 *
 * Attempts to parse as JSON first, then falls back to line-based parsing.
 */
export function parseCustomLintOutput(output: string): LintResult {
  const trimmed = output.trim();

  // Try JSON parsing first
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeJsonLintOutput(parsed);
    } catch {
      // Fall through to line-based parsing
    }
  }

  // Line-based parsing for text output
  return parseLineLintOutput(trimmed);
}

/**
 * Parse custom diff command output into DiffResult
 *
 * Attempts to parse as JSON first, then falls back to line-based parsing.
 */
export function parseCustomDiffOutput(output: string): DiffResult {
  const trimmed = output.trim();

  // Try JSON parsing first
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeJsonDiffOutput(parsed);
    } catch {
      // Fall through to line-based parsing
    }
  }

  // Line-based parsing for text output
  return parseLineDiffOutput(trimmed);
}

/**
 * Normalize JSON lint output from various tools
 */
function normalizeJsonLintOutput(parsed: unknown): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const issue = normalizeIssue(item);
      if (issue.severity === 'error') {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    // Handle object with errors/warnings arrays
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.errors)) {
      errors.push(...obj.errors.map((e) => normalizeIssue(e, 'error')));
    }
    if (Array.isArray(obj.warnings)) {
      warnings.push(...obj.warnings.map((w) => normalizeIssue(w, 'warning')));
    }
    if (Array.isArray(obj.problems)) {
      for (const p of obj.problems) {
        const issue = normalizeIssue(p);
        if (issue.severity === 'error') {
          errors.push(issue);
        } else {
          warnings.push(issue);
        }
      }
    }
  }

  return { contract: '', specPath: '', errors, warnings };
}

/**
 * Normalize a single issue from various formats
 */
function normalizeIssue(item: unknown, defaultSeverity: 'error' | 'warning' = 'error'): LintIssue {
  if (typeof item === 'string') {
    return {
      path: '',
      message: item,
      severity: defaultSeverity,
    };
  }

  if (typeof item !== 'object' || item === null) {
    return {
      path: '',
      message: String(item),
      severity: defaultSeverity,
    };
  }

  const obj = item as Record<string, unknown>;

  // Common field mappings
  const path = String(obj.path ?? obj.location ?? obj.pointer ?? obj.instancePath ?? '');
  const message = String(obj.message ?? obj.text ?? obj.description ?? obj.msg ?? '');
  const rule = obj.rule ?? obj.ruleId ?? obj.code ?? obj.id;
  const severity = normalizeSeverity(obj.severity ?? obj.level ?? defaultSeverity);

  return {
    path,
    message,
    rule: rule ? String(rule) : undefined,
    severity,
  };
}

/**
 * Normalize severity from various formats
 */
function normalizeSeverity(value: unknown): 'error' | 'warning' {
  if (typeof value === 'number') {
    // Common: 0=error, 1=warning, 2=info (Spectral)
    // Or: 1=error, 2=warning, 3=info (some tools)
    return value <= 1 ? 'error' : 'warning';
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'error' || lower === 'err' || lower === 'fatal') {
      return 'error';
    }
  }
  return 'warning';
}

/**
 * Parse line-based lint output
 */
function parseLineLintOutput(output: string): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  const lines = output.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Common patterns:
    // "error: message" or "warning: message"
    // "path:line:col: error message"
    // "[ERROR] message"

    const lowerLine = line.toLowerCase();
    const isError =
      lowerLine.includes('error') || lowerLine.includes('[err]') || lowerLine.startsWith('e ');
    const isWarning =
      lowerLine.includes('warning') || lowerLine.includes('[warn]') || lowerLine.startsWith('w ');

    if (isError || isWarning || line.includes(':')) {
      const issue: LintIssue = {
        path: '',
        message: line.trim(),
        severity: isError ? 'error' : 'warning',
      };

      if (isError) {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return { contract: '', specPath: '', errors, warnings };
}

/**
 * Normalize JSON diff output from various tools
 */
function normalizeJsonDiffOutput(parsed: unknown): DiffResult {
  const changes: Change[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      changes.push(normalizeChange(item));
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    // Handle object with changes/items array
    const items = obj.changes ?? obj.items ?? obj.differences ?? [];
    if (Array.isArray(items)) {
      for (const item of items) {
        changes.push(normalizeChange(item));
      }
    }
  }

  const summary = {
    breaking: changes.filter((c) => c.severity === 'breaking').length,
    nonBreaking: changes.filter((c) => c.severity === 'non-breaking').length,
    patch: changes.filter((c) => c.severity === 'patch').length,
    unknown: changes.filter((c) => c.severity === 'unknown').length,
  };

  const suggestedBump =
    summary.breaking > 0
      ? 'major'
      : summary.nonBreaking > 0
        ? 'minor'
        : summary.patch > 0
          ? 'patch'
          : 'none';

  return { contract: '', changes, summary, suggestedBump };
}

/**
 * Normalize a single change from various formats
 */
function normalizeChange(item: unknown): Change {
  if (typeof item !== 'object' || item === null) {
    return {
      path: '',
      severity: 'unknown',
      category: 'unknown-change',
      message: String(item),
    };
  }

  const obj = item as Record<string, unknown>;

  const path = String(obj.path ?? obj.location ?? obj.pointer ?? '');
  const message = String(obj.message ?? obj.text ?? obj.description ?? '');
  const category = String(obj.category ?? obj.code ?? obj.id ?? 'unknown-change');

  // Determine severity
  let severity: Change['severity'] = 'unknown';
  if (obj.severity) {
    const sev = String(obj.severity).toLowerCase();
    if (sev === 'breaking' || sev === 'major') {
      severity = 'breaking';
    } else if (sev === 'non-breaking' || sev === 'minor') {
      severity = 'non-breaking';
    } else if (sev === 'patch') {
      severity = 'patch';
    }
  } else if (obj.level !== undefined) {
    // oasdiff style: level 3 = breaking
    const level = Number(obj.level);
    if (level === 3) severity = 'breaking';
    else if (level === 2) severity = 'non-breaking';
    else if (level === 1) severity = 'patch';
  } else if (obj.breaking === true) {
    severity = 'breaking';
  }

  return {
    path,
    severity,
    category,
    message,
    oldValue: obj.oldValue ?? obj.old ?? obj.from,
    newValue: obj.newValue ?? obj.new ?? obj.to,
  };
}

/**
 * Parse line-based diff output
 */
function parseLineDiffOutput(output: string): DiffResult {
  const changes: Change[] = [];

  const lines = output.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const isBreaking =
      lowerLine.includes('breaking') ||
      lowerLine.includes('removed') ||
      lowerLine.includes('major');

    changes.push({
      path: '',
      severity: isBreaking ? 'breaking' : 'unknown',
      category: 'unknown-change',
      message: line.trim(),
    });
  }

  const summary = {
    breaking: changes.filter((c) => c.severity === 'breaking').length,
    nonBreaking: 0,
    patch: 0,
    unknown: changes.filter((c) => c.severity === 'unknown').length,
  };

  const suggestedBump = summary.breaking > 0 ? 'major' : 'none';

  return { contract: '', changes, summary, suggestedBump };
}
