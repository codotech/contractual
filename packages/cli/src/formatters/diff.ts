/**
 * Diff output formatters
 *
 * Format diff results for text and JSON output.
 */

import chalk from 'chalk';
import type { DiffResult, Change, ChangeSeverity, DiffSummary } from '@contractual/types';

export interface FormatOptions {
  /** Show JSON Pointer paths for each change */
  verbose?: boolean;
}

/**
 * Format diff results as human-readable text
 */
export function formatDiffText(results: DiffResult[], options: FormatOptions = {}): void {
  if (results.length === 0) {
    console.log(chalk.dim('No contracts to diff.'));
    return;
  }

  for (const result of results) {
    formatContractResult(result, options);
  }
}

/**
 * Format a single contract's diff result
 */
function formatContractResult(result: DiffResult, options: FormatOptions): void {
  if (result.changes.length === 0) {
    console.log(`${chalk.cyan(result.contract)}: ${chalk.dim('no changes')}`);
    console.log();
    return;
  }

  // Build summary parts
  const parts: string[] = [];
  if (result.summary.breaking > 0) {
    parts.push(`${result.summary.breaking} breaking`);
  }
  if (result.summary.nonBreaking > 0) {
    parts.push(`${result.summary.nonBreaking} non-breaking`);
  }
  if (result.summary.patch > 0) {
    parts.push(`${result.summary.patch} patch`);
  }
  if (result.summary.unknown > 0) {
    parts.push(`${result.summary.unknown} unknown`);
  }

  // Color for suggested bump
  const bumpColor =
    result.suggestedBump === 'major'
      ? chalk.red
      : result.suggestedBump === 'minor'
        ? chalk.yellow
        : chalk.green;

  // Header line
  console.log(
    `${chalk.cyan(result.contract)}: ${result.changes.length} change(s) (${parts.join(', ')}) — suggested bump: ${bumpColor(result.suggestedBump)}`
  );
  console.log();

  // Each change
  for (const change of result.changes) {
    const label = formatSeverityLabel(change.severity);
    console.log(`  ${label} ${change.message}`);
    if (options.verbose && change.path) {
      console.log(`${' '.repeat(14)}path: ${chalk.dim(change.path)}`);
    }
  }
  console.log();
}

/**
 * Format severity as a colored, padded label
 */
function formatSeverityLabel(severity: ChangeSeverity): string {
  switch (severity) {
    case 'breaking':
      return chalk.red.bold('BREAKING'.padEnd(12));
    case 'non-breaking':
      return chalk.yellow('non-breaking');
    case 'patch':
      return chalk.green('patch'.padEnd(12));
    case 'unknown':
      return chalk.gray('unknown'.padEnd(12));
    default:
      return chalk.gray(String(severity).padEnd(12));
  }
}

/**
 * Format diff results as JSON
 *
 * Output format:
 * {
 *   "contracts": {
 *     "order": { "changes": [...], "summary": {...}, "suggestedBump": "minor" },
 *     "petstore": { "changes": [...], "summary": {...}, "suggestedBump": "none" }
 *   }
 * }
 */
export function formatDiffJson(results: DiffResult[]): string {
  const contracts: Record<string, Omit<DiffResult, 'contract'>> = {};

  for (const result of results) {
    const { contract, ...rest } = result;
    contracts[contract] = rest;
  }

  return JSON.stringify({ contracts }, null, 2);
}

/**
 * Filter results by severity level
 */
export function filterBySeverity(results: DiffResult[], severity: string): DiffResult[] {
  if (severity === 'all') {
    return results;
  }

  return results.map((r) => {
    const filteredChanges = r.changes.filter((c) => c.severity === severity);
    return {
      ...r,
      changes: filteredChanges,
      summary: recalculateSummary(filteredChanges),
      suggestedBump: calculateSuggestedBump(filteredChanges),
    };
  });
}

/**
 * Recalculate summary from filtered changes
 */
function recalculateSummary(changes: Change[]): DiffSummary {
  return {
    breaking: changes.filter((c) => c.severity === 'breaking').length,
    nonBreaking: changes.filter((c) => c.severity === 'non-breaking').length,
    patch: changes.filter((c) => c.severity === 'patch').length,
    unknown: changes.filter((c) => c.severity === 'unknown').length,
  };
}

/**
 * Calculate suggested bump from changes
 */
function calculateSuggestedBump(changes: Change[]): 'major' | 'minor' | 'patch' | 'none' {
  if (changes.some((c) => c.severity === 'breaking')) {
    return 'major';
  }
  if (changes.some((c) => c.severity === 'non-breaking')) {
    return 'minor';
  }
  if (changes.some((c) => c.severity === 'patch')) {
    return 'patch';
  }
  return 'none';
}
