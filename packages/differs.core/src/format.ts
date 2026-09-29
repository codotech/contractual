/**
 * Human-readable message formatting for raw changes
 */

import type { RawChange } from '@contractual/types';

/**
 * Format a human-readable message for a change
 *
 * @param change - The raw change to format
 * @returns Human-readable message describing the change
 */
export function formatChangeMessage(change: RawChange): string {
  const pathDisplay = decodeJsonPointer(change.path || '/');

  switch (change.type) {
    case 'property-added':
      return `Property added at ${pathDisplay}`;

    case 'property-removed':
      return `Property removed at ${pathDisplay}`;

    case 'required-added':
      return `Field "${formatRequiredFieldName(change.newValue)}" made required at ${pathDisplay}`;

    case 'required-removed':
      return `Field "${formatRequiredFieldName(change.oldValue)}" made optional at ${pathDisplay}`;

    case 'type-changed':
      return `Type changed from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)} at ${pathDisplay}`;

    case 'type-narrowed':
      return `Type narrowed from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)} at ${pathDisplay}`;

    case 'type-widened':
      return `Type widened from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)} at ${pathDisplay}`;

    case 'enum-value-added':
      return `Enum value ${formatValue(change.newValue)} added at ${pathDisplay}`;

    case 'enum-value-removed':
      return `Enum value ${formatValue(change.oldValue)} removed at ${pathDisplay}`;

    case 'enum-added':
      return `Enum constraint added at ${pathDisplay}`;

    case 'enum-removed':
      return `Enum constraint removed at ${pathDisplay}`;

    case 'constraint-tightened':
      return formatConstraintMessage(change, 'tightened', pathDisplay);

    case 'constraint-loosened':
      return formatConstraintMessage(change, 'loosened', pathDisplay);

    case 'format-added':
      return `Format "${change.newValue}" added at ${pathDisplay}`;

    case 'format-removed':
      return `Format "${change.oldValue}" removed at ${pathDisplay}`;

    case 'format-changed':
      return `Format changed from "${change.oldValue}" to "${change.newValue}" at ${pathDisplay}`;

    case 'additional-properties-denied':
      return `Additional properties denied at ${pathDisplay}`;

    case 'additional-properties-allowed':
      return `Additional properties allowed at ${pathDisplay}`;

    case 'additional-properties-changed':
      return `Additional properties schema changed at ${pathDisplay}`;

    case 'items-changed':
      return `Array items schema changed at ${pathDisplay}`;

    case 'min-items-increased':
      return `Minimum items increased from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)} at ${pathDisplay}`;

    case 'max-items-decreased':
      return `Maximum items decreased from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)} at ${pathDisplay}`;

    case 'composition-changed':
      return `Composition (allOf/anyOf/oneOf) changed at ${pathDisplay}`;

    case 'ref-target-changed':
      return `Reference target changed at ${pathDisplay}`;

    case 'description-changed':
      return `Description changed at ${pathDisplay}`;

    case 'title-changed':
      return `Title changed at ${pathDisplay}`;

    case 'default-changed':
      return `Default value changed at ${pathDisplay}`;

    case 'examples-changed':
      return `Examples changed at ${pathDisplay}`;

    case 'deprecated-changed':
      return change.newValue
        ? `Deprecated at ${pathDisplay}`
        : `No longer deprecated at ${pathDisplay}`;

    case 'read-only-changed':
      return `readOnly changed at ${pathDisplay}`;

    case 'write-only-changed':
      return `writeOnly changed at ${pathDisplay}`;

    // OpenAPI structural changes
    case 'path-added':
      return `New path added: ${change.newValue ?? pathDisplay}`;

    case 'path-removed':
      return `Path removed: ${change.oldValue ?? pathDisplay}`;

    case 'operation-added':
      return `New operation added: ${change.newValue ?? pathDisplay}`;

    case 'operation-removed':
      return `Operation removed: ${change.oldValue ?? pathDisplay}`;

    case 'parameter-added':
      return `Optional parameter added at ${pathDisplay}`;

    case 'parameter-required-added':
      return `Required parameter added at ${pathDisplay}`;

    case 'parameter-removed':
      return `Parameter removed at ${pathDisplay}`;

    case 'parameter-required-changed':
      return `Parameter required changed from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)} at ${pathDisplay}`;

    case 'parameter-schema-changed':
      return `Parameter schema changed at ${pathDisplay}`;

    case 'request-body-added':
      return `Request body added at ${pathDisplay}`;

    case 'request-body-removed':
      return `Request body removed at ${pathDisplay}`;

    case 'response-added':
      return `Response ${formatValue(change.newValue)} added at ${pathDisplay}`;

    case 'response-removed':
      return `Response ${formatValue(change.oldValue)} removed at ${pathDisplay}`;

    case 'response-schema-changed':
      return `Response schema changed at ${pathDisplay}`;

    case 'security-changed':
      return `Security changed at ${pathDisplay}`;

    case 'server-changed':
      return `Server changed at ${pathDisplay}`;

    // Composition changes
    case 'anyof-option-added':
      return `anyOf option added at ${pathDisplay}`;

    case 'anyof-option-removed':
      return `anyOf option removed at ${pathDisplay}`;

    case 'oneof-option-added':
      return `oneOf option added at ${pathDisplay}`;

    case 'oneof-option-removed':
      return `oneOf option removed at ${pathDisplay}`;

    case 'allof-member-added':
      return `allOf member added at ${pathDisplay}`;

    case 'allof-member-removed':
      return `allOf member removed at ${pathDisplay}`;

    case 'not-schema-changed':
      return `not schema changed at ${pathDisplay}`;

    case 'if-then-else-changed':
      return `Conditional schema (if/then/else) changed at ${pathDisplay}`;

    case 'unknown-change':
    default:
      return `Unknown change at ${pathDisplay}`;
  }
}

/**
 * Decode a JSON Pointer path for human-readable display (RFC 6901)
 * Decodes each segment individually so that slashes within keys
 * (e.g. OpenAPI path keys like /v1/extract) are kept intact
 * rather than being confused with segment separators.
 */
function decodeJsonPointer(path: string): string {
  if (!path.startsWith('/')) return path;

  const segments = path.split('/');
  // segments[0] is '' (before the leading /)
  const decoded = segments.map((seg, i) => {
    if (i === 0) return seg;
    const value = seg.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value.includes('/')) return `[${value}]`;
    return value;
  });

  return decoded.join('/');
}

/**
 * Format a value for display in messages
 */
function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format required field name from change value
 */
function formatRequiredFieldName(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

/**
 * Format constraint change message
 */
function formatConstraintMessage(
  change: RawChange,
  direction: 'tightened' | 'loosened',
  pathDisplay: string
): string {
  const constraintName = extractConstraintName(change.path);
  const oldVal = change.oldValue !== undefined ? formatValue(change.oldValue) : 'none';
  const newVal = change.newValue !== undefined ? formatValue(change.newValue) : 'none';

  if (constraintName) {
    return `Constraint "${constraintName}" ${direction} from ${oldVal} to ${newVal} at ${pathDisplay}`;
  }

  return `Constraint ${direction} from ${oldVal} to ${newVal} at ${pathDisplay}`;
}

/**
 * Extract constraint name from path
 */
function extractConstraintName(path: string): string | null {
  const segments = path.split('/');
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment !== '') {
    return lastSegment;
  }
  return null;
}
