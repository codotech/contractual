/**
 * JSON Schema Structural Differ
 *
 * Compares two JSON Schema files and detects structural changes,
 * classifying them by severity for semver bump decisions.
 */

import { readFile } from 'node:fs/promises';
import type { DiffResult } from '@contractual/types';
import { resolveRefs, walk, assembleResult, formatChangeMessage } from '@contractual/differs.core';

// Re-export for backward compatibility
export { formatChangeMessage };

/**
 * Diff two JSON Schema files and detect structural changes
 *
 * @param oldPath - Path to the old/base schema file
 * @param newPath - Path to the new/changed schema file
 * @returns DiffResult with classified changes and suggested bump
 */
export async function diffJsonSchema(oldPath: string, newPath: string): Promise<DiffResult> {
  let oldContent: string;
  let newContent: string;

  try {
    oldContent = await readFile(oldPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read old schema file "${oldPath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    newContent = await readFile(newPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read new schema file "${newPath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let oldSchema: unknown;
  let newSchema: unknown;

  try {
    oldSchema = JSON.parse(oldContent);
  } catch (error) {
    throw new Error(
      `Failed to parse old schema as JSON "${oldPath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    newSchema = JSON.parse(newContent);
  } catch (error) {
    throw new Error(
      `Failed to parse new schema as JSON "${newPath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return diffJsonSchemaObjects(oldSchema, newSchema);
}

/**
 * Diff two JSON Schema objects and detect structural changes
 *
 * @param oldSchema - The old/base schema object
 * @param newSchema - The new/changed schema object
 * @returns DiffResult with classified changes and suggested bump
 */
export function diffJsonSchemaObjects(oldSchema: unknown, newSchema: unknown): DiffResult {
  const resolvedOld = resolveRefs(oldSchema).schema;
  const resolvedNew = resolveRefs(newSchema).schema;

  const rawChanges = walk(resolvedOld, resolvedNew, '');

  return assembleResult(rawChanges, resolvedNew);
}
