/**
 * Changeset Command
 *
 * Auto-generate changeset from detected changes.
 * Uses the shared diffContracts() function internally.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/index.js';
import { diffContracts } from '../core/diff.js';
import { CHANGESETS_DIR } from '../utils/files.js';
import {
  createChangeset,
  generateUniqueChangesetName,
  readChangesets,
} from '@contractual/changesets';

/**
 * Auto-generate changeset from detected changes
 */
export async function changesetCommand(): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  let config;
  try {
    config = loadConfig();
    spinner.succeed('Configuration loaded');
  } catch (error) {
    spinner.fail('Failed to load configuration');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(message));
    process.exit(1);
  }

  // Detect changes for all contracts using shared diff logic
  const diffSpinner = ora('Detecting changes...').start();

  try {
    const { results: diffResults, contractualDir } = await diffContracts(config, {
      includeEmpty: false, // Only get contracts with actual changes
    });

    if (diffResults.length === 0) {
      diffSpinner.succeed('No changes detected');
      console.log(chalk.gray('No changeset created.'));
      process.exit(0);
    }

    diffSpinner.succeed(`Detected changes in ${diffResults.length} contract(s)`);

    // Create changeset content
    const { content: changesetContent } = createChangeset(diffResults);

    // Read existing changesets to ensure unique name
    const changesetsDir = join(contractualDir, CHANGESETS_DIR);
    const existingChangesets = await readChangesets(changesetsDir);
    const existingNames = existingChangesets.map((c) => c.filename.replace(/\.md$/, ''));
    const changesetName = generateUniqueChangesetName(existingNames);

    // Write changeset file
    const changesetPath = join(changesetsDir, `${changesetName}.md`);

    writeFileSync(changesetPath, changesetContent, 'utf-8');

    console.log();
    console.log(chalk.green('Created changeset:'), chalk.cyan(changesetPath));
    console.log();
    console.log(chalk.gray('You can edit this file to add more details about the changes.'));
    console.log(chalk.gray('Run `contractual version` to consume changesets and bump versions.'));
  } catch (error) {
    diffSpinner.fail('Failed to detect changes');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}
