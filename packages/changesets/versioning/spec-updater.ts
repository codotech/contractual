/**
 * Spec Version Updater
 *
 * Updates the version field inside a spec file (e.g., info.version in OpenAPI)
 * to keep the spec's internal version in sync with the tracked version.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parseDocument } from 'yaml';
import type { ContractType } from '@contractual/types';

/**
 * Contract types that have a version field in the spec
 */
const VERSION_FIELD_PATHS: Partial<Record<ContractType, readonly string[]>> = {
  openapi: ['info', 'version'],
  asyncapi: ['info', 'version'],
  odcs: ['version'],
};

/**
 * Detect indentation used in a JSON file
 */
function detectJsonIndent(content: string): number {
  const match = content.match(/^(\s+)"/m);
  return match?.[1]?.length ?? 2;
}

/**
 * Ensure nested path exists in a plain object, creating intermediate objects as needed.
 * Returns the parent object of the last key.
 */
function ensureJsonPath(
  root: Record<string, unknown>,
  fieldPath: readonly string[]
): Record<string, unknown> {
  let current = root;
  for (let i = 0; i < fieldPath.length - 1; i++) {
    const key = fieldPath[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  return current;
}

/**
 * Update the version field inside a JSON spec file.
 * Creates missing intermediate objects if needed.
 */
function updateJsonSpec(specPath: string, fieldPath: readonly string[], newVersion: string): void {
  const content = readFileSync(specPath, 'utf-8');
  const spec = JSON.parse(content) as Record<string, unknown>;

  const parent = ensureJsonPath(spec, fieldPath);
  parent[fieldPath.at(-1)!] = newVersion;

  const indent = detectJsonIndent(content);
  const trailingNewline = content.endsWith('\n') ? '\n' : '';
  writeFileSync(specPath, JSON.stringify(spec, null, indent) + trailingNewline, 'utf-8');
}

/**
 * Render a string as a YAML scalar matching the quoting style of an existing node.
 * Plain versions like `4.0.0` stay plain; quoted nodes keep their quote style so a
 * value that would otherwise parse as a number (e.g. `1.0`) is preserved as a string.
 */
function renderScalar(value: string, originalType: string | undefined): string {
  if (originalType === 'QUOTE_DOUBLE') {
    return JSON.stringify(value);
  }
  if (originalType === 'QUOTE_SINGLE') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  // PLAIN or unknown: quote only if the value could be misread as a non-string scalar
  return /^[\w.-]+$/.test(value) && !/^[+-]?(\d|\.\d|true|false|null|~)/i.test(value)
    ? value
    : JSON.stringify(value);
}

/**
 * Surgically replace just the target scalar's source range, leaving the rest of the
 * file byte-for-byte intact. Used when the document has parse errors elsewhere and
 * cannot be re-stringified as a whole. Returns true if the field was found and updated.
 */
function spliceScalarInPlace(
  specPath: string,
  content: string,
  doc: ReturnType<typeof parseDocument>,
  fieldPath: readonly string[],
  newVersion: string
): boolean {
  const node = doc.getIn([...fieldPath], true) as
    | { range?: [number, number, number]; type?: string }
    | undefined;

  // No range means the field lives in (or past) a malformed region we cannot edit safely.
  if (!node?.range) {
    return false;
  }

  const [start, valueEnd] = node.range;
  const replacement = renderScalar(newVersion, node.type);
  const updated = content.slice(0, start) + replacement + content.slice(valueEnd);
  writeFileSync(specPath, updated, 'utf-8');
  return true;
}

/**
 * Update the version field inside a YAML spec file.
 * Uses parseDocument() to preserve comments, formatting, and key ordering.
 * Creates missing intermediate keys if needed.
 *
 * If the document has recoverable parse errors elsewhere (e.g. a malformed
 * description deep in the file), `Document.toString()` would refuse to serialize.
 * In that case we fall back to a surgical in-place edit of the target scalar so a
 * defect unrelated to the version field never takes down the release. If even that
 * is not possible, we skip the sync with a clear warning rather than throwing.
 */
function updateYamlSpec(specPath: string, fieldPath: readonly string[], newVersion: string): void {
  const content = readFileSync(specPath, 'utf-8');
  const doc = parseDocument(content);

  if (doc.errors.length === 0) {
    // setIn creates intermediate nodes automatically
    doc.setIn([...fieldPath], newVersion);
    writeFileSync(specPath, doc.toString(), 'utf-8');
    return;
  }

  // Document has parse errors; toString() would throw. Edit the field in place.
  const first = doc.errors[0]!;
  const where = first.linePos?.[0] ? ` (e.g. ${first.code} at line ${first.linePos[0].line})` : '';

  if (spliceScalarInPlace(specPath, content, doc, fieldPath, newVersion)) {
    console.warn(
      `Spec "${specPath}" has YAML parse issues${where}; synced "${fieldPath.join('.')}" via in-place edit. Consider fixing the spec.`
    );
    return;
  }

  console.warn(
    `Skipped version sync for "${specPath}": the file has YAML parse errors${where} and "${fieldPath.join('.')}" could not be located. The version field was not changed.`
  );
}

/**
 * Update the version field inside a spec file.
 *
 * Reads the spec, updates the appropriate version field based on contract type,
 * and writes it back preserving the original format (YAML comments, JSON indentation).
 * If the version field (or its parent, e.g. `info`) is missing, it will be created.
 *
 * @param specPath - Absolute path to the spec file
 * @param newVersion - The new version string to set
 * @param contractType - The type of contract (openapi, asyncapi, odcs, json-schema)
 * @returns true if the file was updated, false if the spec type has no version field (e.g. json-schema)
 */
export function updateSpecVersion(
  specPath: string,
  newVersion: string,
  contractType: ContractType
): boolean {
  const fieldPath = VERSION_FIELD_PATHS[contractType];
  if (!fieldPath) {
    return false;
  }

  const ext = extname(specPath).toLowerCase();
  if (ext === '.json') {
    updateJsonSpec(specPath, fieldPath, newVersion);
  } else {
    updateYamlSpec(specPath, fieldPath, newVersion);
  }

  return true;
}
