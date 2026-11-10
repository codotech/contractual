import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { initCommand } from './commands/init.command.js';
import { contractAddCommand, contractListCommand } from './commands/contract.command.js';
import { lintCommand } from './commands/lint.command.js';
import { diffCommand } from './commands/diff.command.js';
import { breakingCommand } from './commands/breaking.command.js';
import { changesetCommand } from './commands/changeset.command.js';
import { versionCommand } from './commands/version.command.js';
import { preEnterCommand, preExitCommand, preStatusCommand } from './commands/pre.command.js';
import { statusCommand } from './commands/status.command.js';

const program = new Command();

const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .version as string;
program
  .name('contractual')
  .description('Schema contract lifecycle orchestrator')
  .version(packageVersion);

program
  .command('init')
  .description('Initialize Contractual in this repository')
  .option('-V, --initial-version <version>', 'Initial version for contracts')
  .option('--versioning <mode>', 'Versioning mode: independent, fixed')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--force', 'Reinitialize existing project')
  .action(initCommand);

const contractCmd = program.command('contract').description('Manage contracts');

contractCmd
  .command('add')
  .description('Add a new contract to the configuration')
  .option('-n, --name <name>', 'Contract name')
  .option('-t, --type <type>', 'Contract type: openapi, asyncapi, json-schema, odcs')
  .option('-p, --path <path>', 'Path to spec file')
  .option('--initial-version <version>', 'Initial version (default: 0.0.0)')
  .option('--skip-validation', 'Skip spec validation')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(contractAddCommand);

contractCmd
  .command('list [name]')
  .description('List contracts (optionally filter by name)')
  .option('--json', 'Output as JSON')
  .action(contractListCommand);

program
  .command('lint')
  .description('Lint all configured contracts')
  .option('-c, --contract <name>', 'Lint specific contract')
  .option('--format <format>', 'Output format: text, json', 'text')
  .option('--fail-on-warn', 'Exit 1 on warnings')
  .action(lintCommand);

program
  .command('diff')
  .description('Show all changes between current specs and last versioned snapshots')
  .option('-c, --contract <name>', 'Diff specific contract')
  .option('--format <format>', 'Output format: text, json', 'text')
  .option('--severity <level>', 'Filter: all, breaking, non-breaking, patch', 'all')
  .option('--verbose', 'Show JSON Pointer paths for each change')
  .action(diffCommand);

program
  .command('breaking')
  .description('Detect breaking changes against last snapshot')
  .option('-c, --contract <name>', 'Check specific contract')
  .option('--format <format>', 'Output format: text, json', 'text')
  .option('--fail-on <level>', 'Exit 1 on: breaking, non-breaking, any', 'breaking')
  .action(breakingCommand);

program
  .command('changeset')
  .description('Create changeset from detected changes')
  .action(changesetCommand);

program
  .command('version')
  .description('Consume changesets and bump versions')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Preview without applying')
  .option('--json', 'Output JSON (implies --yes)')
  .option('--no-sync-version', 'Skip updating version field inside spec files')
  .action(versionCommand);

const preCmd = program.command('pre').description('Manage pre-release versions');

preCmd
  .command('enter <tag>')
  .description('Enter pre-release mode (e.g., alpha, beta, rc)')
  .action(preEnterCommand);

preCmd.command('exit').description('Exit pre-release mode').action(preExitCommand);

preCmd.command('status').description('Show pre-release status').action(preStatusCommand);

program
  .command('status')
  .description('Show current versions and pending changesets')
  .action(statusCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(2);
});
