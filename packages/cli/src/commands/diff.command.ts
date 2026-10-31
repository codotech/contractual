/**
 * Diff Command
 *
 * Show all changes between current specs and their last versioned snapshots,
 * classified by severity.
 *
 * Unlike `breaking`, which is a CI gate (exits 1 on breaking changes),
 * `diff` is informational — it always exits 0 on success.
 */

import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/index.js';
import { diffContracts } from '../core/diff.js';
import { formatDiffText, formatDiffJson, filterBySeverity } from '../formatters/diff.js';

interface DiffOptions {
  contract?: string;
  format?: 'text' | 'json';
  severity?: 'all' | 'breaking' | 'non-breaking' | 'patch';
  verbose?: boolean;
}

/**
 * Show all changes between current specs and last versioned snapshots
 */
export async function diffCommand(options: DiffOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  let config;
  try {
    config = loadConfig();
    spinner.succeed('Configuration loaded');
  } catch (error) {
    spinner.fail('Failed to load configuration');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(message));
    process.exitCode = 2;
    return;
  }

  const diffSpinner = ora('Comparing specs against snapshots...').start();

  try {
    const { results } = await diffContracts(config, {
      contracts: options.contract ? [options.contract] : undefined,
      includeEmpty: true, // Show "no changes" for contracts with no diff
    });

    diffSpinner.succeed('Comparison complete');
    console.log();

    // Apply severity filter
    const filtered = filterBySeverity(results, options.severity ?? 'all');

    // Output results
    if (options.format === 'json') {
      console.log(formatDiffJson(filtered));
    } else {
      formatDiffText(filtered, { verbose: options.verbose });
    }

    // diff always exits 0 on success (it's informational, not a gate)
    process.exitCode = 0;
  } catch (error) {
    diffSpinner.fail('Comparison failed');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), message);
    process.exitCode = 3; // Tool execution error
  }
}
