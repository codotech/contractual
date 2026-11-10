import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../config/index.js';
import { findContractualDir, VERSIONS_FILE, CHANGESETS_DIR } from '../utils/files.js';
import { aggregateBumps, incrementVersion, readChangesets } from '@contractual/changesets';
import type { VersionsFile, ChangesetFile } from '@contractual/types';

/**
 * Read versions.json file
 */
function readVersions(contractualDir: string): VersionsFile {
  const versionsPath = join(contractualDir, VERSIONS_FILE);

  if (!existsSync(versionsPath)) {
    return {};
  }

  try {
    const content = readFileSync(versionsPath, 'utf-8');
    return JSON.parse(content) as VersionsFile;
  } catch {
    return {};
  }
}

/**
 * Show current state - versions, pending changesets, projected bumps
 */
export async function statusCommand(): Promise<void> {
  try {
    // Load config
    const config = loadConfig();
    const contractualDir = findContractualDir();

    if (!contractualDir) {
      console.log(chalk.red('Not initialized:') + ' .contractual directory not found');
      console.log(chalk.dim('Run `contractual init` to get started'));
      process.exitCode = 1;
      return;
    }

    // Read versions
    const versions = readVersions(contractualDir);

    // Read pending changesets
    const changesetsDir = join(contractualDir, CHANGESETS_DIR);
    let changesets: ChangesetFile[] = [];
    try {
      changesets = await readChangesets(changesetsDir);
    } catch (error) {
      // If parsing fails, show a warning but continue
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(chalk.yellow(`Warning: ${message}`));
    }

    // Calculate projected bumps
    const projectedBumps = aggregateBumps(changesets);

    // Print header
    console.log(chalk.bold('\nContractual Status\n'));

    // Print contract versions
    console.log(chalk.bold.underline('Contracts'));
    console.log();

    if (config.contracts.length === 0) {
      console.log(chalk.dim('  No contracts configured'));
    } else {
      for (const contract of config.contracts) {
        const versionEntry = versions[contract.name];
        const currentVersion = versionEntry?.version ?? '0.0.0';
        const bump = projectedBumps[contract.name];

        let projectedVersion: string | null = null;
        if (bump) {
          projectedVersion = incrementVersion(currentVersion, bump);
        }

        // Contract name and type
        const typeLabel = chalk.dim(`(${contract.type})`);
        console.log(`  ${chalk.cyan(contract.name)} ${typeLabel}`);

        // Version info
        const versionLabel = versionEntry
          ? chalk.green(`v${currentVersion}`)
          : chalk.dim('v0.0.0 (unreleased)');

        if (projectedVersion) {
          const bumpColor =
            bump === 'major' ? chalk.red : bump === 'minor' ? chalk.yellow : chalk.green;
          console.log(
            `    ${versionLabel} ${chalk.dim('->')} ${bumpColor(`v${projectedVersion}`)} ${chalk.dim(`(${bump})`)}`
          );
        } else {
          console.log(`    ${versionLabel}`);
        }

        // Release date
        if (versionEntry?.released) {
          const date = new Date(versionEntry.released).toLocaleDateString();
          console.log(`    ${chalk.dim(`Released: ${date}`)}`);
        }

        console.log();
      }
    }

    // Print pending changesets
    console.log(chalk.bold.underline('Pending Changesets'));
    console.log();

    if (changesets.length === 0) {
      console.log(chalk.dim('  No pending changesets'));
      console.log(chalk.dim('  Run `contractual add` to create one'));
    } else {
      console.log(`  ${chalk.yellow(changesets.length.toString())} changeset(s) pending\n`);

      for (const changeset of changesets) {
        console.log(`  ${chalk.dim('-')} ${changeset.filename}`);

        for (const [contract, bump] of Object.entries(changeset.bumps)) {
          const bumpColor =
            bump === 'major' ? chalk.red : bump === 'minor' ? chalk.yellow : chalk.green;
          console.log(`      ${chalk.cyan(contract)}: ${bumpColor(bump)}`);
        }
      }
    }

    console.log();

    // Summary
    const hasProjectedBumps = Object.keys(projectedBumps).length > 0;
    if (hasProjectedBumps) {
      console.log(
        chalk.dim('Run `contractual version` to apply pending changesets and bump versions')
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), message);
    process.exitCode = 1;
  }
}
