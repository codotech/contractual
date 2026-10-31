/**
 * OpenAPI spec resolver using @redocly/openapi-core
 *
 * Handles both OpenAPI 3.0 and 3.1 specifications.
 * Uses Redocly to bundle external refs into a single document,
 * then uses the core ref-resolver to dereference internal $refs
 * (which handles circular references safely).
 */

import { resolveRefs } from '@contractual/differs.core';

/**
 * Resolve an OpenAPI spec file to a fully dereferenced object
 *
 * @param specPath - Absolute or relative path to the OpenAPI spec file
 * @returns The fully resolved OpenAPI document as a plain object
 */
export async function resolveOpenApiSpec(specPath: string): Promise<Record<string, unknown>> {
  let bundle: typeof import('@redocly/openapi-core').bundle;
  let loadConfig: typeof import('@redocly/openapi-core').loadConfig;

  try {
    const redocly = await import('@redocly/openapi-core');
    bundle = redocly.bundle;
    loadConfig = redocly.loadConfig;
  } catch {
    throw new Error(
      'OpenAPI diffing requires @redocly/openapi-core. ' +
        'Install it with: npm install @redocly/openapi-core'
    );
  }

  // Bundle only (no dereference) — resolves external refs into one document
  // but keeps internal $refs intact to avoid circular object references
  const config = await loadConfig();
  const result = await bundle({ ref: specPath, config });
  const bundled = result.bundle.parsed as Record<string, unknown>;

  // Use our own ref-resolver which handles circular refs safely
  const resolved = resolveRefs(bundled);
  return resolved.schema as Record<string, unknown>;
}
