import chalk from 'chalk';
import { VersionManager, PreReleaseManager } from '@contractual/changesets';
import { findContractualDir } from '../utils/files.js';

/**
 * Enter pre-release mode
 * @param tag - The pre-release tag (e.g., "alpha", "beta", "rc")
 */
export async function preEnterCommand(tag: string): Promise<void> {
  const cwd = process.cwd();
  const contractualDir = findContractualDir(cwd);

  if (!contractualDir) {
    console.error(chalk.red('No .contractual directory found. Run `contractual init` first.'));
    process.exitCode = 1;
    return;
  }

  try {
    const versionManager = new VersionManager(contractualDir);
    const preManager = new PreReleaseManager(contractualDir);

    if (preManager.isActive()) {
      const state = preManager.getState();
      console.log(chalk.yellow('Already in pre-release mode:') + ` ${state?.tag}`);
      console.log(chalk.dim('Run `contractual pre exit` to leave pre-release mode first.'));
      process.exitCode = 1;
      return;
    }

    preManager.enter(tag, versionManager);

    console.log(chalk.green('✓') + ` Entered pre-release mode: ${chalk.cyan(tag)}`);
    console.log();
    console.log(chalk.bold('Created:'));
    console.log(`  ${chalk.green('+')} .contractual/pre.json`);
    console.log();
    console.log(chalk.dim(`Next versions will use ${tag} identifier (e.g., 2.0.0-${tag}.0)`));
    console.log(
      chalk.dim('Run `contractual version` to apply changesets with pre-release versions.')
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Failed to enter pre-release mode:'), message);
    process.exitCode = 1;
  }
}

/**
 * Exit pre-release mode
 */
export async function preExitCommand(): Promise<void> {
  const cwd = process.cwd();
  const contractualDir = findContractualDir(cwd);

  if (!contractualDir) {
    console.error(chalk.red('No .contractual directory found. Run `contractual init` first.'));
    process.exitCode = 1;
    return;
  }

  try {
    const versionManager = new VersionManager(contractualDir);
    const preManager = new PreReleaseManager(contractualDir);

    if (!preManager.isActive()) {
      console.log(chalk.yellow('Not in pre-release mode.'));
      return;
    }

    const state = preManager.getState();
    const currentVersions = versionManager.getAllVersions();

    // Show what will change
    console.log(chalk.bold('Exiting pre-release mode'));
    console.log();

    const hasPreReleaseVersions = Object.entries(currentVersions).some(([_, version]) =>
      version.includes('-')
    );

    if (hasPreReleaseVersions) {
      console.log(chalk.dim('Current pre-release versions:'));
      for (const [contract, version] of Object.entries(currentVersions)) {
        if (version.includes('-')) {
          // Extract base version
          const baseVersion = version.split('-')[0];
          console.log(
            `  ${chalk.cyan(contract)}: ${chalk.gray(version)} → ${chalk.green(baseVersion)}`
          );
        }
      }
      console.log();
      console.log(chalk.dim('Run `contractual version` after exiting to finalize versions.'));
    }

    preManager.exit();

    console.log();
    console.log(chalk.green('✓') + ' Exited pre-release mode');
    console.log();
    console.log(chalk.bold('Removed:'));
    console.log(`  ${chalk.red('-')} .contractual/pre.json`);

    if (state) {
      console.log();
      console.log(chalk.dim(`Pre-release tag was: ${state.tag}`));
      console.log(chalk.dim(`Entered at: ${new Date(state.enteredAt).toLocaleString()}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Failed to exit pre-release mode:'), message);
    process.exitCode = 1;
  }
}

/**
 * Show pre-release status
 */
export async function preStatusCommand(): Promise<void> {
  const cwd = process.cwd();
  const contractualDir = findContractualDir(cwd);

  if (!contractualDir) {
    console.error(chalk.red('No .contractual directory found. Run `contractual init` first.'));
    process.exitCode = 1;
    return;
  }

  const preManager = new PreReleaseManager(contractualDir);

  if (!preManager.isActive()) {
    console.log(chalk.dim('Not in pre-release mode.'));
    console.log(chalk.dim('Run `contractual pre enter <tag>` to enter pre-release mode.'));
    return;
  }

  const state = preManager.getState();
  if (!state) {
    console.log(chalk.yellow('Pre-release state file is corrupted.'));
    console.log(chalk.dim('Run `contractual pre exit` to reset.'));
    return;
  }

  const versionManager = new VersionManager(contractualDir);
  const currentVersions = versionManager.getAllVersions();

  console.log(chalk.bold('Pre-release Status'));
  console.log();
  console.log(`  ${chalk.dim('Tag:')}       ${chalk.cyan(state.tag)}`);
  console.log(`  ${chalk.dim('Since:')}     ${new Date(state.enteredAt).toLocaleString()}`);

  // Show version changes since entering pre-release
  const changedContracts = Object.entries(currentVersions).filter(([name, version]) => {
    const initial = state.initialVersions[name];
    return initial && initial !== version;
  });

  if (changedContracts.length > 0) {
    console.log();
    console.log(chalk.bold('Version changes since entering pre-release:'));
    for (const [name, version] of changedContracts) {
      const initial = state.initialVersions[name];
      console.log(`  ${chalk.cyan(name)}: ${chalk.gray(initial)} → ${chalk.green(version)}`);
    }
  }

  console.log();
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  contractual version    Apply changesets with pre-release versions'));
  console.log(chalk.dim('  contractual pre exit   Exit pre-release mode'));
}
