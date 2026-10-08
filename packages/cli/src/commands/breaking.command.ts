/**
 * Breaking Command
 *
 * Detect breaking changes against snapshots.
 * This is a CI gate — exits 1 if breaking changes are found.
 *
 * Uses the shared diffContracts() function internally.
 */

import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/index.js';
import { diffContracts } from '../core/diff.js';
import { formatSeverity } from '../utils/output.js';
import type { DiffResult } from '@contractual/types';

interface BreakingOptions {
  contract?: string;
  format?: 'text' | 'json';
  failOn?: 'breaking' | 'non-breaking' | 'any';
}

interface BreakingCommandResult {
  hasBreaking: boolean;
  results: DiffResult[];
}

/**
 * Detect breaking changes against snapshots
 */
export async function breakingCommand(options: BreakingOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  let config;
  try {
    config = loadConfig();
    spinner.succeed('Configuration loaded');
  } catch (error) {
    spinner.fail('Failed to load configuration');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(message));
    process.exitCode = 1;
    return;
  }

  const checkSpinner = ora('Checking for breaking changes...').start();

  try {
    const { results } = await diffContracts(config, {
      contracts: options.contract ? [options.contract] : undefined,
      includeEmpty: true,
    });

    const hasBreaking = results.some((r) => r.summary.breaking > 0);

    if (hasBreaking) {
      checkSpinner.fail('Breaking changes detected');
    } else {
      checkSpinner.succeed('No breaking changes');
    }

    // Output results
    console.log();
    if (options.format === 'json') {
      const output: BreakingCommandResult = { hasBreaking, results };
      console.log(JSON.stringify(output, null, 2));
    } else {
      printTextResults(results);
    }

    // Determine exit code based on --fail-on option
    const failOn = options.failOn ?? 'breaking';
    let shouldFail = false;

    if (failOn === 'any') {
      // Fail on any detected changes
      shouldFail = results.some((r) => r.changes.length > 0);
    } else if (failOn === 'non-breaking') {
      // Fail on non-breaking or breaking changes
      shouldFail = results.some((r) => r.summary.breaking > 0 || r.summary.nonBreaking > 0);
    } else {
      // Default: fail only on breaking changes
      shouldFail = hasBreaking;
    }

    if (shouldFail) {
      process.exitCode = 1;
    }
  } catch (error) {
    checkSpinner.fail('Failed to check for breaking changes');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), message);
    process.exitCode = 1;
  }
}

/**
 * Print results in human-readable text format
 */
function printTextResults(results: DiffResult[]): void {
  if (results.length === 0) {
    console.log(chalk.gray('No contracts were checked.'));
    return;
  }

  for (const result of results) {
    console.log(chalk.bold.underline(result.contract));
    console.log();

    if (result.changes.length === 0) {
      console.log(chalk.gray('  No changes detected.'));
      console.log();
      continue;
    }

    // Group changes by severity
    const breaking = result.changes.filter((c) => c.severity === 'breaking');
    const nonBreaking = result.changes.filter((c) => c.severity === 'non-breaking');
    const patch = result.changes.filter((c) => c.severity === 'patch');
    const unknown = result.changes.filter((c) => c.severity === 'unknown');

    // Print summary
    console.log(
      `  Summary: ` +
        `${chalk.red(String(result.summary.breaking))} breaking, ` +
        `${chalk.yellow(String(result.summary.nonBreaking))} non-breaking, ` +
        `${chalk.green(String(result.summary.patch))} patch, ` +
        `${chalk.gray(String(result.summary.unknown))} unknown`
    );
    console.log(`  Suggested bump: ${chalk.cyan(result.suggestedBump)}`);
    console.log();

    // Print changes by severity
    if (breaking.length > 0) {
      console.log(`  ${formatSeverity('breaking')} Changes:`);
      for (const change of breaking) {
        console.log(`    - ${change.path}: ${change.message}`);
      }
      console.log();
    }

    if (nonBreaking.length > 0) {
      console.log(`  ${formatSeverity('non-breaking')} Changes:`);
      for (const change of nonBreaking) {
        console.log(`    - ${change.path}: ${change.message}`);
      }
      console.log();
    }

    if (patch.length > 0) {
      console.log(`  ${formatSeverity('patch')} Changes:`);
      for (const change of patch) {
        console.log(`    - ${change.path}: ${change.message}`);
      }
      console.log();
    }

    if (unknown.length > 0) {
      console.log(`  ${formatSeverity('unknown')} Changes:`);
      for (const change of unknown) {
        console.log(`    - ${change.path}: ${change.message}`);
      }
      console.log();
    }
  }
}
