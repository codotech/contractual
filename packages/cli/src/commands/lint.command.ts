import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/index.js';
import { getLinter as getRegisteredLinter } from '../governance/index.js';
import { printSuccess, printError, printWarning } from '../utils/output.js';
import type { LintResult, LintFn, ResolvedContract } from '@contractual/types';

/**
 * Options for the lint command
 */
export interface LintOptions {
  /** Filter to specific contract name */
  contract?: string;
  /** Output format */
  format?: 'text' | 'json';
  /** Exit 1 on warnings */
  failOnWarn?: boolean;
}

/**
 * Result type for linter lookup
 */
type LinterLookupResult =
  | { status: 'disabled' }
  | { status: 'not-found'; type: string }
  | { status: 'found'; linter: LintFn };

/**
 * Get linter for a contract using the governance registry
 */
function getLinterForContract(contract: ResolvedContract): LinterLookupResult {
  // Check if linting is explicitly disabled
  if (contract.lint === false) {
    return { status: 'disabled' };
  }

  // Use the governance registry to get the linter
  const linter = getRegisteredLinter(contract.type, contract.lint);

  if (linter === null) {
    return { status: 'not-found', type: contract.type };
  }

  if (!linter) {
    return { status: 'not-found', type: contract.type };
  }

  return { status: 'found', linter };
}

/**
 * Run linters for all configured contracts
 */
export async function lintCommand(options: LintOptions = {}): Promise<void> {
  const { contract: filterContract, format = 'text', failOnWarn = false } = options;

  try {
    // Load config
    const config = loadConfig();

    // Filter contracts if specified
    let contracts = config.contracts;
    if (filterContract) {
      contracts = contracts.filter((c) => c.name === filterContract);
      if (contracts.length === 0) {
        if (format === 'json') {
          console.log(JSON.stringify({ error: `Contract "${filterContract}" not found` }));
        } else {
          printError(`Contract "${filterContract}" not found`);
        }
        process.exitCode = 1;
        return;
      }
    }

    if (contracts.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify({ results: [], errors: 0, warnings: 0 }));
      } else {
        printWarning('No contracts configured');
      }
      return;
    }

    const results: LintResult[] = [];
    const spinner = format === 'text' ? ora('Linting contracts...').start() : null;

    for (const contract of contracts) {
      if (spinner) {
        spinner.text = `Linting ${contract.name}...`;
      }

      const linterResult = getLinterForContract(contract);

      // Linting explicitly disabled
      if (linterResult.status === 'disabled') {
        if (format === 'text') {
          spinner?.stopAndPersist({
            symbol: chalk.dim('-'),
            text: `${contract.name}: ${chalk.dim('linting disabled')}`,
          });
          spinner?.start();
        }
        continue;
      }

      // No linter registered for this type
      if (linterResult.status === 'not-found') {
        results.push({
          contract: contract.name,
          specPath: contract.absolutePath,
          errors: [
            {
              path: '',
              severity: 'error',
              message: `No linter available for ${contract.type}. Configure a custom lint command or set lint: false.`,
            },
          ],
          warnings: [],
        });
        if (format === 'text') {
          spinner?.stopAndPersist({
            symbol: chalk.yellow('!'),
            text: `${contract.name}: ${chalk.yellow(`no linter available for ${linterResult.type}`)}`,
          });
          spinner?.start();
        }
        continue;
      }

      try {
        const result = await linterResult.linter(contract.absolutePath);
        results.push({
          ...result,
          contract: contract.name,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Linter execution failed';
        results.push({
          contract: contract.name,
          specPath: contract.absolutePath,
          errors: [
            {
              path: '',
              message,
              severity: 'error',
            },
          ],
          warnings: [],
        });
      }
    }

    spinner?.stop();

    // Calculate totals
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    // Output results
    if (format === 'json') {
      console.log(
        JSON.stringify(
          {
            results,
            errors: totalErrors,
            warnings: totalWarnings,
          },
          null,
          2
        )
      );
    } else {
      // Text format output
      console.log();

      for (const result of results) {
        const hasErrors = result.errors.length > 0;
        const hasWarnings = result.warnings.length > 0;

        if (!hasErrors && !hasWarnings) {
          printSuccess(`${result.contract}: No issues found`);
          continue;
        }

        // Print contract header
        const errorCount = result.errors.length;
        const warningCount = result.warnings.length;
        const summary = [];
        if (errorCount > 0) summary.push(chalk.red(`${errorCount} error(s)`));
        if (warningCount > 0) summary.push(chalk.yellow(`${warningCount} warning(s)`));

        console.log(`${chalk.bold(result.contract)}: ${summary.join(', ')}`);

        // Print errors
        for (const error of result.errors) {
          const location = error.path ? chalk.dim(`[${error.path}]`) : '';
          const rule = error.rule ? chalk.dim(`(${error.rule})`) : '';
          console.log(`  ${chalk.red('error')} ${location} ${error.message} ${rule}`);
        }

        // Print warnings
        for (const warning of result.warnings) {
          const location = warning.path ? chalk.dim(`[${warning.path}]`) : '';
          const rule = warning.rule ? chalk.dim(`(${warning.rule})`) : '';
          console.log(`  ${chalk.yellow('warn')}  ${location} ${warning.message} ${rule}`);
        }

        console.log();
      }

      // Summary
      if (results.length > 0) {
        console.log(
          chalk.dim(
            `Checked ${results.length} contract(s): ` +
              `${totalErrors} error(s), ${totalWarnings} warning(s)`
          )
        );
      }
    }

    // Exit with error code if there were errors (or warnings if --fail-on-warn)
    if (totalErrors > 0 || (failOnWarn && totalWarnings > 0)) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (options.format === 'json') {
      console.log(JSON.stringify({ error: message }));
    } else {
      printError(message);
    }
    process.exitCode = 1;
  }
}
