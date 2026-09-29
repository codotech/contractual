/**
 * OpenAPI Differ
 *
 * Compares two OpenAPI specifications and detects breaking changes.
 * Supports OpenAPI 3.0 and 3.1.
 */

import type { DiffResult } from '@contractual/types';
import { assembleResult } from '@contractual/differs.core';
import { resolveOpenApiSpec } from './resolver.js';
import { diffStructural } from './structural.js';

/**
 * Diff two OpenAPI specification files
 *
 * @param oldSpecPath - Path to the old/base OpenAPI spec file
 * @param newSpecPath - Path to the new/changed OpenAPI spec file
 * @returns DiffResult with classified changes and suggested bump
 */
export async function diffOpenApi(oldSpecPath: string, newSpecPath: string): Promise<DiffResult> {
  const oldSpec = await resolveOpenApiSpec(oldSpecPath);
  const newSpec = await resolveOpenApiSpec(newSpecPath);

  return diffOpenApiObjects(oldSpec, newSpec);
}

/**
 * Diff two resolved OpenAPI spec objects directly
 *
 * @param oldSpec - The old/base OpenAPI spec object (fully resolved)
 * @param newSpec - The new/changed OpenAPI spec object (fully resolved)
 * @returns DiffResult with classified changes and suggested bump
 */
export function diffOpenApiObjects(
  oldSpec: Record<string, unknown>,
  newSpec: Record<string, unknown>
): DiffResult {
  const rawChanges = diffStructural(oldSpec, newSpec);
  return assembleResult(rawChanges, newSpec);
}
