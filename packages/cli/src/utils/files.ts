import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ContractType } from '@contractual/types';
import { CHANGESETS_DIR, SNAPSHOTS_DIR, VERSIONS_FILE } from '@contractual/changesets';

/**
 * The .contractual directory name
 */
export const CONTRACTUAL_DIR = '.contractual';

// Re-export constants from @contractual/changesets for backward compatibility
export { CHANGESETS_DIR, SNAPSHOTS_DIR, VERSIONS_FILE };

/**
 * Find the .contractual directory starting from a given path
 */
export function findContractualDir(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir);
  const root = dirname(currentDir);

  while (currentDir !== root) {
    const contractualDir = join(currentDir, CONTRACTUAL_DIR);
    if (existsSync(contractualDir)) {
      return contractualDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check root directory too
  const contractualDir = join(currentDir, CONTRACTUAL_DIR);
  if (existsSync(contractualDir)) {
    return contractualDir;
  }

  return null;
}

/**
 * Ensure the .contractual directory structure exists
 */
export function ensureContractualDir(baseDir: string): string {
  const contractualDir = join(baseDir, CONTRACTUAL_DIR);
  const changesetsDir = join(contractualDir, CHANGESETS_DIR);
  const snapshotsDir = join(contractualDir, SNAPSHOTS_DIR);

  mkdirSync(changesetsDir, { recursive: true });
  mkdirSync(snapshotsDir, { recursive: true });

  // Create versions.json if it doesn't exist
  const versionsPath = join(contractualDir, VERSIONS_FILE);
  if (!existsSync(versionsPath)) {
    writeFileSync(versionsPath, '{}', 'utf-8');
  }

  // Create .gitkeep files
  const changesetsGitkeep = join(changesetsDir, '.gitkeep');
  const snapshotsGitkeep = join(snapshotsDir, '.gitkeep');
  if (!existsSync(changesetsGitkeep)) {
    writeFileSync(changesetsGitkeep, '', 'utf-8');
  }
  if (!existsSync(snapshotsGitkeep)) {
    writeFileSync(snapshotsGitkeep, '', 'utf-8');
  }

  return contractualDir;
}

/**
 * Read and parse a spec file (YAML or JSON)
 */
export function readSpecFile(filePath: string): unknown {
  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(content);
  }

  // YAML (handles .yaml, .yml)
  return parseYaml(content);
}

/**
 * Detect spec type from file path and content
 */
export function detectSpecType(filePath: string): ContractType | null {
  // Check extension patterns first
  if (/\.openapi\.(ya?ml|json)$/i.test(filePath)) return 'openapi';
  if (/\.asyncapi\.(ya?ml|json)$/i.test(filePath)) return 'asyncapi';
  if (/\.odcs\.ya?ml$/i.test(filePath)) return 'odcs';
  if (/\.schema\.json$/i.test(filePath)) return 'json-schema';

  // Content sniffing
  try {
    const spec = readSpecFile(filePath) as Record<string, unknown>;
    if (!spec || typeof spec !== 'object') return null;

    // OpenAPI detection
    if ('openapi' in spec || 'swagger' in spec) return 'openapi';

    // AsyncAPI detection
    if ('asyncapi' in spec) return 'asyncapi';

    // ODCS detection
    if ('dataContractSpecification' in spec || spec.kind === 'DataContract') return 'odcs';

    // JSON Schema detection
    if (
      ('$schema' in spec && String(spec.$schema).includes('json-schema')) ||
      ('type' in spec && 'properties' in spec)
    )
      return 'json-schema';

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the file extension for a contract type
 */
export function getSpecExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return ext || '.yaml';
}

/**
 * Copy a spec file to the snapshots directory
 */
export function copyToSnapshots(
  specPath: string,
  contractName: string,
  contractualDir: string
): string {
  const ext = getSpecExtension(specPath);
  const snapshotPath = join(contractualDir, SNAPSHOTS_DIR, `${contractName}${ext}`);
  copyFileSync(specPath, snapshotPath);
  return snapshotPath;
}

/**
 * Get the snapshot path for a contract
 */
export function getSnapshotPath(contractName: string, contractualDir: string): string | null {
  const snapshotsDir = join(contractualDir, SNAPSHOTS_DIR);
  const extensions = ['.yaml', '.yml', '.json'];

  for (const ext of extensions) {
    const snapshotPath = join(snapshotsDir, `${contractName}${ext}`);
    if (existsSync(snapshotPath)) {
      return snapshotPath;
    }
  }

  return null;
}
