import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/index.js';
import { findContractualDir, CHANGESETS_DIR } from '../utils/files.js';
import { promptConfirm, type PromptOptions } from '../utils/prompts.js';
import {
  VersionManager,
  PreReleaseManager,
  readChangesets,
  aggregateBumps,
  extractContractChanges,
  appendChangelog,
  incrementVersion,
  incrementVersionWithPreRelease,
  updateSpecVersion,
} from '@contractual/changesets';
import type { BumpResult, BumpType } from '@contractual/types';

/**
 * Options for the version command
 */
interface VersionOptions extends PromptOptions {
  /** Preview without applying */
  dryRun?: boolean;
  /** Output JSON (implies --yes) */
  json?: boolean;
  /** Skip updating version field inside spec files */
  syncVersion?: boolean;
}

/**
 * Pending version bump info
 */
interface PendingBump {
  contract: string;
  currentVersion: string;
  nextVersion: string;
  bumpType: BumpType;
}

/**
 * Consume changesets and bump versions
 */
export async function versionCommand(options: VersionOptions = {}): Promise<void> {
  // JSON output implies --yes (no prompts)
  if (options.json) {
    options.yes = true;
  }

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

  const contractualDir = findContractualDir(config.configDir);
  if (!contractualDir) {
    console.error(chalk.red('No .contractual directory found. Run `contractual init` first.'));
    process.exit(1);
  }

  // Read all changesets
  if (config.versioning?.mode === 'fixed') {
    throw new Error(
      'Fixed versioning is not implemented. Use versioning.mode: independent. No versions were changed.'
    );
  }

  const readSpinner = ora('Reading changesets...').start();
  const changesetsDir = join(contractualDir, CHANGESETS_DIR);
  const changesets = await readChangesets(changesetsDir);

  if (changesets.length === 0) {
    readSpinner.succeed('No pending changesets');
    if (options.json) {
      console.log(JSON.stringify({ bumps: [], changesets: 0 }, null, 2));
    } else {
      console.log(chalk.gray('Nothing to version.'));
    }
    process.exit(0);
  }

  readSpinner.succeed(`Found ${changesets.length} changeset(s)`);

  // Aggregate bumps (highest wins per contract)
  const aggregatedBumps = aggregateBumps(changesets);

  const unknownContracts = Object.keys(aggregatedBumps).filter(
    (name) => !config.contracts.some((contract) => contract.name === name)
  );
  if (unknownContracts.length > 0) {
    throw new Error(
      `Changesets reference unknown contracts: ${unknownContracts.join(', ')}. No changesets were consumed.`
    );
  }

  if (Object.keys(aggregatedBumps).length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ bumps: [], changesets: changesets.length }, null, 2));
    } else {
      console.log(chalk.gray('No version bumps required.'));
    }
    process.exit(0);
  }

  // Initialize version manager for reading current versions
  const versionManager = new VersionManager(contractualDir);
  const preManager = new PreReleaseManager(contractualDir);
  const preReleaseTag = preManager.getTag();

  // Calculate pending bumps (preview)
  const pendingBumps: PendingBump[] = [];

  for (const [contractName, bumpType] of Object.entries(aggregatedBumps)) {
    const contract = config.contracts.find((c) => c.name === contractName);
    if (!contract) {
      continue;
    }

    const currentVersion = versionManager.getVersion(contractName) ?? '0.0.0';
    const nextVersion = preReleaseTag
      ? incrementVersionWithPreRelease(currentVersion, bumpType, preReleaseTag)
      : incrementVersion(currentVersion, bumpType);

    pendingBumps.push({
      contract: contractName,
      currentVersion,
      nextVersion,
      bumpType,
    });
  }

  // Show pre-release mode notice
  if (preReleaseTag && !options.json) {
    console.log(chalk.cyan(`Pre-release mode: ${preReleaseTag}`));
  }

  // Show preview
  if (options.json) {
    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            bumps: pendingBumps.map((b) => ({
              contract: b.contract,
              current: b.currentVersion,
              next: b.nextVersion,
              type: b.bumpType,
            })),
            changesets: changesets.length,
          },
          null,
          2
        )
      );
      return;
    }
  } else {
    printPreviewTable(pendingBumps);

    if (options.dryRun) {
      console.log();
      console.log(chalk.dim('Dry run - no changes applied'));
      return;
    }
  }

  // Confirm before applying (unless --yes)
  if (!options.json) {
    const shouldApply = await promptConfirm('Apply these version bumps?', true, options);

    if (!shouldApply) {
      console.log(chalk.dim('Cancelled'));
      return;
    }
  }

  // Apply version bumps
  const bumpSpinner = options.json ? null : ora('Applying version bumps...').start();
  const bumpResults: BumpResult[] = [];
  const consumedChangesetPaths: string[] = [];

  for (const [contractName, bumpType] of Object.entries(aggregatedBumps)) {
    const contract = config.contracts.find((c) => c.name === contractName);
    if (!contract) {
      if (!options.json) {
        console.warn(
          chalk.yellow(`Warning: Contract "${contractName}" not found in config, skipping.`)
        );
      }
      continue;
    }

    const oldVersion = versionManager.getVersion(contractName) ?? '0.0.0';
    let newVersion: string;

    const shouldSyncVersion = options.syncVersion !== false && contract.syncVersion !== false;

    if (preReleaseTag) {
      // Use pre-release version increment
      newVersion = incrementVersionWithPreRelease(oldVersion, bumpType, preReleaseTag);
      if (shouldSyncVersion) {
        updateSpecVersion(contract.absolutePath, newVersion, contract.type);
      }
      versionManager.setVersion(contractName, newVersion, contract.absolutePath);
    } else {
      // Normal bump — compute version first, update spec, then bump (which copies to snapshots)
      newVersion = incrementVersion(oldVersion, bumpType);
      if (shouldSyncVersion) {
        updateSpecVersion(contract.absolutePath, newVersion, contract.type);
      }
      versionManager.bump(contractName, bumpType, contract.absolutePath);
    }

    // Extract changes text from changesets for this contract
    const changes = extractContractChanges(changesets, contractName);

    bumpResults.push({
      contract: contractName,
      oldVersion,
      newVersion,
      bumpType,
      changes,
    });
  }

  bumpSpinner?.succeed('Version bumps applied');

  // Append to CHANGELOG.md
  const changelogSpinner = options.json ? null : ora('Updating changelog...').start();
  const changelogPath = join(config.configDir, 'CHANGELOG.md');
  try {
    appendChangelog(changelogPath, bumpResults);
    changelogSpinner?.succeed('Changelog updated');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    changelogSpinner?.warn(`Failed to update changelog: ${message}`);
  }

  // Delete consumed changeset files
  const cleanupSpinner = options.json ? null : ora('Cleaning up changesets...').start();

  for (const changeset of changesets) {
    const changesetPath = join(changesetsDir, changeset.filename);
    try {
      if (existsSync(changesetPath)) {
        unlinkSync(changesetPath);
        consumedChangesetPaths.push(changeset.filename);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  cleanupSpinner?.succeed(`Removed ${consumedChangesetPaths.length} changeset(s)`);

  // Print summary
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          bumps: bumpResults.map((r) => ({
            contract: r.contract,
            old: r.oldVersion,
            new: r.newVersion,
            type: r.bumpType,
          })),
          changesets: consumedChangesetPaths.length,
        },
        null,
        2
      )
    );
  } else {
    console.log();
    console.log(chalk.bold('Version Summary:'));
    console.log();

    for (const result of bumpResults) {
      console.log(
        `  ${chalk.cyan(result.contract)}: ` +
          `${chalk.gray(result.oldVersion)} -> ${chalk.green(result.newVersion)} ` +
          `(${result.bumpType})`
      );
    }

    console.log();
    console.log(chalk.green('Done!'), `${bumpResults.length} contract(s) versioned.`);
  }
}

/**
 * Print a preview table of pending version bumps
 */
function printPreviewTable(bumps: PendingBump[]): void {
  console.log();
  console.log(chalk.bold('Pending version bumps:'));
  console.log();

  // Calculate column widths
  const maxContractLen = Math.max(8, ...bumps.map((b) => b.contract.length));
  const maxCurrentLen = Math.max(7, ...bumps.map((b) => b.currentVersion.length));
  const maxNextLen = Math.max(4, ...bumps.map((b) => b.nextVersion.length));

  // Header
  const header =
    `  ${'Contract'.padEnd(maxContractLen)}  ` +
    `${'Current'.padEnd(maxCurrentLen)}  ` +
    `${'→'}  ` +
    `${'Next'.padEnd(maxNextLen)}  ` +
    `Reason`;
  console.log(chalk.dim(header));
  console.log(chalk.dim('  ' + '─'.repeat(header.length - 2)));

  // Rows
  for (const bump of bumps) {
    const reason = getBumpReason(bump.bumpType);
    console.log(
      `  ${chalk.cyan(bump.contract.padEnd(maxContractLen))}  ` +
        `${chalk.gray(bump.currentVersion.padEnd(maxCurrentLen))}  ` +
        `${chalk.dim('→')}  ` +
        `${chalk.green(bump.nextVersion.padEnd(maxNextLen))}  ` +
        `${reason}`
    );
  }
}

/**
 * Get human-readable reason for bump type
 */
function getBumpReason(bumpType: BumpType): string {
  switch (bumpType) {
    case 'major':
      return chalk.red('major (breaking)');
    case 'minor':
      return chalk.yellow('minor (feature)');
    case 'patch':
      return chalk.dim('patch (fix)');
    default:
      return bumpType;
  }
}
