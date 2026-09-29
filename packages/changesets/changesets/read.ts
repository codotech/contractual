/**
 * Changeset reading and parsing utilities
 * Parses changeset files from the .contractual/changesets directory
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { BumpType, ChangesetFile } from '@contractual/types';

/**
 * Valid bump type values
 */
const VALID_BUMP_TYPES = ['major', 'minor', 'patch'] as const;

/**
 * Error thrown when parsing a changeset file fails
 */
export class ChangesetParseError extends Error {
  constructor(
    message: string,
    public readonly filename?: string
  ) {
    super(filename ? `Failed to parse changeset "${filename}": ${message}` : message);
    this.name = 'ChangesetParseError';
  }
}

/**
 * Parsed changeset content (before wrapping with filename)
 */
export interface ParsedChangesetContent {
  /** Map of contract name to bump type */
  bumps: Record<string, BumpType>;
  /** Markdown body with change descriptions */
  body: string;
}

/**
 * Validate that a value is a valid bump type
 */
function isValidBumpType(value: unknown): value is BumpType {
  return VALID_BUMP_TYPES.includes(value as BumpType);
}

/**
 * Parse a changeset file content into its components
 *
 * @param content - Raw content of the changeset file
 * @returns Parsed bumps and body
 * @throws {ChangesetParseError} If the content is malformed
 */
export function parseChangeset(content: string): ParsedChangesetContent {
  const trimmed = content.trim();

  // Check for frontmatter delimiter
  if (!trimmed.startsWith('---')) {
    throw new ChangesetParseError('Changeset must start with YAML frontmatter (---)');
  }

  // Find the closing frontmatter delimiter
  const secondDelimiter = trimmed.indexOf('---', 3);
  if (secondDelimiter === -1) {
    throw new ChangesetParseError('Changeset frontmatter must be closed with ---');
  }

  // Extract YAML and body
  const yamlContent = trimmed.slice(3, secondDelimiter).trim();
  const body = trimmed.slice(secondDelimiter + 3).trim();

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (yamlError) {
    const message = yamlError instanceof Error ? yamlError.message : 'Invalid YAML';
    throw new ChangesetParseError(`Invalid YAML in frontmatter: ${message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ChangesetParseError('Changeset frontmatter must contain a YAML object');
  }

  // Validate and extract bumps
  const bumps: Record<string, BumpType> = {};

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isValidBumpType(value)) {
      throw new ChangesetParseError(
        `Invalid bump type "${String(value)}" for contract "${key}". Must be ${VALID_BUMP_TYPES.join(', ')}.`
      );
    }
    bumps[key] = value;
  }

  return { bumps, body };
}

/**
 * Read all changeset files from a directory
 *
 * @param changesetsDir - Path to the changesets directory
 * @returns Array of parsed changeset files
 */
export async function readChangesets(changesetsDir: string): Promise<ChangesetFile[]> {
  let files: string[];

  try {
    files = await readdir(changesetsDir);
  } catch (error) {
    // Directory doesn't exist or can't be read - no changesets
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  // Filter to only .md files
  const mdFiles = files.filter((file) => file.endsWith('.md'));

  const changesets: ChangesetFile[] = [];

  for (const filename of mdFiles) {
    const filePath = join(changesetsDir, filename);
    const content = await readFile(filePath, 'utf-8');

    try {
      const { bumps, body } = parseChangeset(content);
      changesets.push({ filename, path: filePath, bumps, body });
    } catch (error) {
      // Re-throw with filename context
      if (error instanceof ChangesetParseError) {
        throw new ChangesetParseError(error.message, filename);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ChangesetParseError(message, filename);
    }
  }

  return changesets;
}
