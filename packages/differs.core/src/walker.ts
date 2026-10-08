/**
 * JSON Schema structural walker
 *
 * Recursively walks two resolved JSON Schemas side-by-side (DFS)
 * and emits RawChange for every structural difference.
 */

import type { ChangeType, RawChange, CONTENT_KEYS } from './types.js';
import {
  ANNOTATION_KEYS,
  arraysEqual,
  CONSTRAINT_DIRECTION,
  CONSTRAINT_KEYS,
  type ConstraintKey,
  deepEqual,
  DEFAULT_MAX_DEPTH,
  isSchemaObject,
  joinPath,
  METADATA_KEYS,
  type NormalizedType,
  normalizeType,
  type ResolvedSchema,
} from './types.js';

/**
 * Walk two resolved JSON Schemas and emit changes
 *
 * @param oldSchema - The original schema (resolved, no $refs)
 * @param newSchema - The new schema (resolved, no $refs)
 * @param basePath - JSON Pointer base path (default: '')
 * @returns Array of raw changes detected
 */
export function walk(oldSchema: unknown, newSchema: unknown, basePath: string = ''): RawChange[] {
  return walkInternal(oldSchema, newSchema, basePath, 0);
}

/**
 * Internal walk function with depth tracking
 */
function walkInternal(
  oldSchema: unknown,
  newSchema: unknown,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  // Prevent infinite recursion
  if (depth > DEFAULT_MAX_DEPTH) {
    return changes;
  }

  // Handle null/undefined schemas
  if (oldSchema === undefined && newSchema === undefined) {
    return changes;
  }

  // Normalize to objects for comparison
  const oldObj = isSchemaObject(oldSchema) ? oldSchema : null;
  const newObj = isSchemaObject(newSchema) ? newSchema : null;

  // Schema added or removed entirely
  if (oldObj === null && newObj !== null) {
    changes.push({
      path,
      type: 'property-added',
      oldValue: undefined,
      newValue: newSchema,
    });
    return changes;
  }

  if (oldObj !== null && newObj === null) {
    changes.push({
      path,
      type: 'property-removed',
      oldValue: oldSchema,
      newValue: undefined,
    });
    return changes;
  }

  // Both are non-object (boolean schemas in JSON Schema draft-06+)
  if (oldObj === null && newObj === null) {
    if (oldSchema !== newSchema) {
      changes.push({
        path,
        type: 'unknown-change',
        oldValue: oldSchema,
        newValue: newSchema,
      });
    }
    return changes;
  }

  // Both are schema objects - compare all aspects
  const old = oldObj as ResolvedSchema;
  const newS = newObj as ResolvedSchema;

  // 1. Metadata changes (title, description, default, examples)
  changes.push(...compareMetadata(old, newS, path));

  // 2. Annotation changes (deprecated, readOnly, writeOnly)
  changes.push(...compareAnnotations(old, newS, path));

  // 3. Content keyword changes (contentEncoding, contentMediaType, contentSchema)
  changes.push(...compareContentKeywords(old, newS, path, depth));

  // 4. Type changes
  changes.push(...compareType(old, newS, path));

  // 5. Enum changes
  changes.push(...compareEnum(old, newS, path));

  // 6. Format changes
  changes.push(...compareFormat(old, newS, path));

  // 7. Constraint changes
  changes.push(...compareConstraints(old, newS, path));

  // 8. Properties changes (recurse)
  changes.push(...compareProperties(old, newS, path, depth));

  // 9. Required changes
  changes.push(...compareRequired(old, newS, path));

  // 10. additionalProperties changes
  changes.push(...compareAdditionalProperties(old, newS, path, depth));

  // 11. propertyNames changes
  changes.push(...comparePropertyNames(old, newS, path, depth));

  // 12. dependentRequired changes
  changes.push(...compareDependentRequired(old, newS, path));

  // 13. dependentSchemas changes
  changes.push(...compareDependentSchemas(old, newS, path, depth));

  // 14. unevaluatedProperties changes
  changes.push(...compareUnevaluatedProperties(old, newS, path, depth));

  // 15. Array items changes (recurse)
  changes.push(...compareArrayItems(old, newS, path, depth));

  // 16. unevaluatedItems changes
  changes.push(...compareUnevaluatedItems(old, newS, path, depth));

  // 17. minContains/maxContains changes
  changes.push(...compareMinMaxContains(old, newS, path));

  // 18. Composition changes (anyOf, oneOf, allOf, if/then/else, not)
  changes.push(...compareComposition(old, newS, path, depth));

  return changes;
}

/**
 * Mapping of metadata keys to their change types
 */
const METADATA_CHANGE_TYPES: Readonly<Record<(typeof METADATA_KEYS)[number], ChangeType>> = {
  description: 'description-changed',
  title: 'title-changed',
  default: 'default-changed',
  examples: 'examples-changed',
} as const;

/**
 * Compare metadata fields (description, title, default, examples)
 */
function compareMetadata(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  for (const key of METADATA_KEYS) {
    const oldValue = oldSchema[key];
    const newValue = newSchema[key];

    if (!deepEqual(oldValue, newValue)) {
      changes.push({
        path: joinPath(path, key),
        type: METADATA_CHANGE_TYPES[key],
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

/**
 * Mapping of annotation keys to their change types
 */
const ANNOTATION_CHANGE_TYPES: Readonly<Record<(typeof ANNOTATION_KEYS)[number], ChangeType>> = {
  deprecated: 'deprecated-changed',
  readOnly: 'read-only-changed',
  writeOnly: 'write-only-changed',
} as const;

/**
 * Compare annotation fields (deprecated, readOnly, writeOnly)
 * These are patch-level changes per Strands API
 */
function compareAnnotations(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  for (const key of ANNOTATION_KEYS) {
    const oldValue = oldSchema[key];
    const newValue = newSchema[key];

    if (oldValue !== newValue) {
      changes.push({
        path: joinPath(path, key),
        type: ANNOTATION_CHANGE_TYPES[key],
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

/**
 * Mapping of content keys to their change types
 */
const CONTENT_CHANGE_TYPES: Readonly<Record<(typeof CONTENT_KEYS)[number], ChangeType>> = {
  contentEncoding: 'content-encoding-changed',
  contentMediaType: 'content-media-type-changed',
  contentSchema: 'content-schema-changed',
} as const;

/**
 * Compare content keywords (contentEncoding, contentMediaType, contentSchema)
 * These are patch-level changes per Strands API
 */
function compareContentKeywords(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  // Compare contentEncoding and contentMediaType (simple string values)
  for (const key of ['contentEncoding', 'contentMediaType'] as const) {
    const oldValue = oldSchema[key];
    const newValue = newSchema[key];

    if (oldValue !== newValue) {
      changes.push({
        path: joinPath(path, key),
        type: CONTENT_CHANGE_TYPES[key],
        oldValue,
        newValue,
      });
    }
  }

  // Compare contentSchema (recurse into schema)
  const oldContentSchema = oldSchema.contentSchema;
  const newContentSchema = newSchema.contentSchema;

  if (!deepEqual(oldContentSchema, newContentSchema)) {
    if (isSchemaObject(oldContentSchema) && isSchemaObject(newContentSchema)) {
      // Both are schemas - recurse but wrap all changes as content-schema-changed
      const nestedChanges = walkInternal(
        oldContentSchema,
        newContentSchema,
        joinPath(path, 'contentSchema'),
        depth + 1
      );
      // If there are nested changes, report as content-schema-changed
      if (nestedChanges.length > 0) {
        changes.push({
          path: joinPath(path, 'contentSchema'),
          type: 'content-schema-changed',
          oldValue: oldContentSchema,
          newValue: newContentSchema,
        });
      }
    } else {
      // Schema added, removed, or type changed
      changes.push({
        path: joinPath(path, 'contentSchema'),
        type: 'content-schema-changed',
        oldValue: oldContentSchema,
        newValue: newContentSchema,
      });
    }
  }

  return changes;
}

/**
 * Compare type field, detecting narrowed/widened/changed
 */
function compareType(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  const oldType = normalizeType(oldSchema.type);
  const newType = normalizeType(newSchema.type);

  // No type defined in either
  if (oldType.length === 0 && newType.length === 0) {
    return changes;
  }

  // Types are identical
  if (arraysEqual(oldType, newType)) {
    return changes;
  }

  // Determine change type
  const changeType = determineTypeChange(oldType, newType);

  changes.push({
    path: joinPath(path, 'type'),
    type: changeType,
    oldValue: oldSchema.type,
    newValue: newSchema.type,
  });

  return changes;
}

/**
 * Determine if type change is narrowed, widened, or changed
 */
function determineTypeChange(oldType: NormalizedType, newType: NormalizedType): ChangeType {
  // Type added where none existed
  if (oldType.length === 0 && newType.length > 0) {
    return 'type-narrowed'; // Adding type constraint narrows
  }

  // Type removed where one existed
  if (oldType.length > 0 && newType.length === 0) {
    return 'type-widened'; // Removing type constraint widens
  }

  // Check if new is subset of old (narrowed)
  const oldSet = new Set(oldType);
  const newSet = new Set(newType);

  const isSubset = newType.every((t) => oldSet.has(t));
  const isSuperset = oldType.every((t) => newSet.has(t));

  if (isSubset && !isSuperset) {
    return 'type-narrowed'; // New allows fewer types
  }

  if (isSuperset && !isSubset) {
    return 'type-widened'; // New allows more types
  }

  // Types changed incompatibly (neither subset nor superset)
  return 'type-changed';
}

/**
 * Compare enum values
 */
function compareEnum(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  const oldEnum = oldSchema.enum;
  const newEnum = newSchema.enum;

  // Enum added
  if (oldEnum === undefined && newEnum !== undefined) {
    changes.push({
      path: joinPath(path, 'enum'),
      type: 'enum-added',
      oldValue: undefined,
      newValue: newEnum,
    });
    return changes;
  }

  // Enum removed
  if (oldEnum !== undefined && newEnum === undefined) {
    changes.push({
      path: joinPath(path, 'enum'),
      type: 'enum-removed',
      oldValue: oldEnum,
      newValue: undefined,
    });
    return changes;
  }

  // Both have enums - compare values
  if (oldEnum !== undefined && newEnum !== undefined) {
    // Find removed values
    for (const oldValue of oldEnum) {
      const exists = newEnum.some((v) => deepEqual(v, oldValue));
      if (!exists) {
        changes.push({
          path: joinPath(path, 'enum'),
          type: 'enum-value-removed',
          oldValue,
          newValue: undefined,
        });
      }
    }

    // Find added values
    for (const newValue of newEnum) {
      const exists = oldEnum.some((v) => deepEqual(v, newValue));
      if (!exists) {
        changes.push({
          path: joinPath(path, 'enum'),
          type: 'enum-value-added',
          oldValue: undefined,
          newValue,
        });
      }
    }
  }

  // Also check const (single-value enum)
  if (!deepEqual(oldSchema.const, newSchema.const)) {
    if (oldSchema.const === undefined && newSchema.const !== undefined) {
      changes.push({
        path: joinPath(path, 'const'),
        type: 'enum-added',
        oldValue: undefined,
        newValue: newSchema.const,
      });
    } else if (oldSchema.const !== undefined && newSchema.const === undefined) {
      changes.push({
        path: joinPath(path, 'const'),
        type: 'enum-removed',
        oldValue: oldSchema.const,
        newValue: undefined,
      });
    } else {
      changes.push({
        path: joinPath(path, 'const'),
        type: 'enum-value-removed',
        oldValue: oldSchema.const,
        newValue: newSchema.const,
      });
    }
  }

  return changes;
}

/**
 * Compare format field
 */
function compareFormat(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  const oldFormat = oldSchema.format;
  const newFormat = newSchema.format;

  if (oldFormat === newFormat) {
    return changes;
  }

  if (oldFormat === undefined && newFormat !== undefined) {
    changes.push({
      path: joinPath(path, 'format'),
      type: 'format-added',
      oldValue: undefined,
      newValue: newFormat,
    });
  } else if (oldFormat !== undefined && newFormat === undefined) {
    changes.push({
      path: joinPath(path, 'format'),
      type: 'format-removed',
      oldValue: oldFormat,
      newValue: undefined,
    });
  } else {
    changes.push({
      path: joinPath(path, 'format'),
      type: 'format-changed',
      oldValue: oldFormat,
      newValue: newFormat,
    });
  }

  return changes;
}

/**
 * Compare numeric and string constraints
 */
function compareConstraints(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  for (const key of CONSTRAINT_KEYS) {
    const oldValue = oldSchema[key];
    const newValue = newSchema[key];

    if (deepEqual(oldValue, newValue)) {
      continue;
    }

    const direction = CONSTRAINT_DIRECTION[key];
    const changeType = determineConstraintChange(key, direction, oldValue, newValue);

    changes.push({
      path: joinPath(path, key),
      type: changeType,
      oldValue,
      newValue,
    });
  }

  return changes;
}

/**
 * Determine if constraint change is tightened or loosened
 */
function determineConstraintChange(
  key: ConstraintKey,
  direction: 'min' | 'max' | 'exact',
  oldValue: unknown,
  newValue: unknown
): ChangeType {
  // Handle special cases for minItems/maxItems
  if (key === 'minItems') {
    if (oldValue === undefined && typeof newValue === 'number') {
      return 'min-items-increased';
    }
    if (typeof oldValue === 'number' && newValue === undefined) {
      return 'constraint-loosened';
    }
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      return newValue > oldValue ? 'min-items-increased' : 'constraint-loosened';
    }
  }

  if (key === 'maxItems') {
    if (oldValue === undefined && typeof newValue === 'number') {
      return 'max-items-decreased';
    }
    if (typeof oldValue === 'number' && newValue === undefined) {
      return 'constraint-loosened';
    }
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      return newValue < oldValue ? 'max-items-decreased' : 'constraint-loosened';
    }
  }

  // Pattern and multipleOf are exact - any change is significant
  if (direction === 'exact') {
    return 'constraint-tightened'; // Conservative: treat as tightening
  }

  // For min constraints: increasing tightens, decreasing loosens
  if (direction === 'min') {
    if (oldValue === undefined && newValue !== undefined) {
      return 'constraint-tightened'; // Adding min constraint tightens
    }
    if (oldValue !== undefined && newValue === undefined) {
      return 'constraint-loosened'; // Removing min constraint loosens
    }
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      return newValue > oldValue ? 'constraint-tightened' : 'constraint-loosened';
    }
  }

  // For max constraints: decreasing tightens, increasing loosens
  if (direction === 'max') {
    if (oldValue === undefined && newValue !== undefined) {
      return 'constraint-tightened'; // Adding max constraint tightens
    }
    if (oldValue !== undefined && newValue === undefined) {
      return 'constraint-loosened'; // Removing max constraint loosens
    }
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      return newValue < oldValue ? 'constraint-tightened' : 'constraint-loosened';
    }
  }

  // Handle uniqueItems specially
  if (key === 'uniqueItems') {
    if (newValue === true && oldValue !== true) {
      return 'constraint-tightened';
    }
    if (newValue !== true && oldValue === true) {
      return 'constraint-loosened';
    }
  }

  return 'constraint-tightened'; // Conservative default
}

/**
 * Compare object properties (recursive)
 */
function compareProperties(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldProps = oldSchema.properties ?? {};
  const newProps = newSchema.properties ?? {};

  const oldKeys = new Set(Object.keys(oldProps));
  const newKeys = new Set(Object.keys(newProps));

  // Find removed properties
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      changes.push({
        path: joinPath(path, 'properties', key),
        type: 'property-removed',
        oldValue: oldProps[key],
        newValue: undefined,
      });
    }
  }

  // Find added properties
  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      changes.push({
        path: joinPath(path, 'properties', key),
        type: 'property-added',
        oldValue: undefined,
        newValue: newProps[key],
      });
    }
  }

  // Recurse into common properties
  for (const key of oldKeys) {
    if (newKeys.has(key)) {
      const nestedChanges = walkInternal(
        oldProps[key],
        newProps[key],
        joinPath(path, 'properties', key),
        depth + 1
      );
      changes.push(...nestedChanges);
    }
  }

  // Also compare patternProperties if present
  const oldPatternProps = oldSchema.patternProperties ?? {};
  const newPatternProps = newSchema.patternProperties ?? {};
  const oldPatternKeys = new Set(Object.keys(oldPatternProps));
  const newPatternKeys = new Set(Object.keys(newPatternProps));

  for (const pattern of oldPatternKeys) {
    if (!newPatternKeys.has(pattern)) {
      changes.push({
        path: joinPath(path, 'patternProperties', pattern),
        type: 'property-removed',
        oldValue: oldPatternProps[pattern],
        newValue: undefined,
      });
    }
  }

  for (const pattern of newPatternKeys) {
    if (!oldPatternKeys.has(pattern)) {
      changes.push({
        path: joinPath(path, 'patternProperties', pattern),
        type: 'property-added',
        oldValue: undefined,
        newValue: newPatternProps[pattern],
      });
    }
  }

  for (const pattern of oldPatternKeys) {
    if (newPatternKeys.has(pattern)) {
      const nestedChanges = walkInternal(
        oldPatternProps[pattern],
        newPatternProps[pattern],
        joinPath(path, 'patternProperties', pattern),
        depth + 1
      );
      changes.push(...nestedChanges);
    }
  }

  return changes;
}

/**
 * Compare required array
 */
function compareRequired(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  const oldRequired = new Set(oldSchema.required ?? []);
  const newRequired = new Set(newSchema.required ?? []);

  // Find removed required fields
  for (const field of oldRequired) {
    if (!newRequired.has(field)) {
      changes.push({
        path: joinPath(path, 'required'),
        type: 'required-removed',
        oldValue: field,
        newValue: undefined,
      });
    }
  }

  // Find added required fields
  for (const field of newRequired) {
    if (!oldRequired.has(field)) {
      changes.push({
        path: joinPath(path, 'required'),
        type: 'required-added',
        oldValue: undefined,
        newValue: field,
      });
    }
  }

  return changes;
}

/**
 * Compare additionalProperties
 */
function compareAdditionalProperties(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldAP = oldSchema.additionalProperties;
  const newAP = newSchema.additionalProperties;

  // No change
  if (deepEqual(oldAP, newAP)) {
    return changes;
  }

  // Normalize: undefined means allowed (true)
  const oldAllows = oldAP !== false;
  const newAllows = newAP !== false;

  // Check for denied/allowed transitions
  if (oldAllows && !newAllows) {
    changes.push({
      path: joinPath(path, 'additionalProperties'),
      type: 'additional-properties-denied',
      oldValue: oldAP,
      newValue: newAP,
    });
    return changes;
  }

  if (!oldAllows && newAllows) {
    changes.push({
      path: joinPath(path, 'additionalProperties'),
      type: 'additional-properties-allowed',
      oldValue: oldAP,
      newValue: newAP,
    });
    return changes;
  }

  // Both allow but with different schemas
  if (isSchemaObject(oldAP) && isSchemaObject(newAP)) {
    const nestedChanges = walkInternal(
      oldAP,
      newAP,
      joinPath(path, 'additionalProperties'),
      depth + 1
    );
    if (nestedChanges.length > 0) {
      changes.push(...nestedChanges);
    }
    return changes;
  }

  // One is boolean, one is schema, or other differences
  if (oldAP !== newAP) {
    changes.push({
      path: joinPath(path, 'additionalProperties'),
      type: 'additional-properties-changed',
      oldValue: oldAP,
      newValue: newAP,
    });
  }

  return changes;
}

/**
 * Compare propertyNames schema
 */
function comparePropertyNames(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  _depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldPN = oldSchema.propertyNames;
  const newPN = newSchema.propertyNames;

  if (deepEqual(oldPN, newPN)) {
    return changes;
  }

  // Any change to propertyNames is complex and requires manual review
  if (isSchemaObject(oldPN) && isSchemaObject(newPN)) {
    // Could recurse, but propertyNames changes are fundamentally unknown
    changes.push({
      path: joinPath(path, 'propertyNames'),
      type: 'property-names-changed',
      oldValue: oldPN,
      newValue: newPN,
    });
  } else if (oldPN !== undefined || newPN !== undefined) {
    changes.push({
      path: joinPath(path, 'propertyNames'),
      type: 'property-names-changed',
      oldValue: oldPN,
      newValue: newPN,
    });
  }

  return changes;
}

/**
 * Compare dependentRequired (Draft 2019-09+)
 */
function compareDependentRequired(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  const oldDR = oldSchema.dependentRequired ?? {};
  const newDR = newSchema.dependentRequired ?? {};

  const oldKeys = new Set(Object.keys(oldDR));
  const newKeys = new Set(Object.keys(newDR));

  // Find removed dependencies (non-breaking)
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      changes.push({
        path: joinPath(path, 'dependentRequired', key),
        type: 'dependent-required-removed',
        oldValue: oldDR[key],
        newValue: undefined,
      });
    }
  }

  // Find added dependencies (breaking)
  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      changes.push({
        path: joinPath(path, 'dependentRequired', key),
        type: 'dependent-required-added',
        oldValue: undefined,
        newValue: newDR[key],
      });
    }
  }

  // Compare modified dependencies
  for (const key of oldKeys) {
    if (newKeys.has(key)) {
      const oldReqs = new Set(oldDR[key] ?? []);
      const newReqs = new Set(newDR[key] ?? []);

      // Find removed requirements (non-breaking)
      for (const req of oldReqs) {
        if (!newReqs.has(req)) {
          changes.push({
            path: joinPath(path, 'dependentRequired', key),
            type: 'dependent-required-removed',
            oldValue: req,
            newValue: undefined,
          });
        }
      }

      // Find added requirements (breaking)
      for (const req of newReqs) {
        if (!oldReqs.has(req)) {
          changes.push({
            path: joinPath(path, 'dependentRequired', key),
            type: 'dependent-required-added',
            oldValue: undefined,
            newValue: req,
          });
        }
      }
    }
  }

  return changes;
}

/**
 * Compare dependentSchemas (Draft 2019-09+)
 */
function compareDependentSchemas(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  _depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldDS = oldSchema.dependentSchemas ?? {};
  const newDS = newSchema.dependentSchemas ?? {};

  const oldKeys = new Set(Object.keys(oldDS));
  const newKeys = new Set(Object.keys(newDS));
  const allKeys = new Set([...oldKeys, ...newKeys]);

  for (const key of allKeys) {
    const oldValue = oldDS[key];
    const newValue = newDS[key];

    if (!deepEqual(oldValue, newValue)) {
      // dependentSchemas changes require manual review
      changes.push({
        path: joinPath(path, 'dependentSchemas', key),
        type: 'dependent-schemas-changed',
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

/**
 * Compare unevaluatedProperties (Draft 2019-09+)
 */
function compareUnevaluatedProperties(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  _depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldUP = oldSchema.unevaluatedProperties;
  const newUP = newSchema.unevaluatedProperties;

  if (deepEqual(oldUP, newUP)) {
    return changes;
  }

  // unevaluatedProperties changes require manual review
  changes.push({
    path: joinPath(path, 'unevaluatedProperties'),
    type: 'unevaluated-properties-changed',
    oldValue: oldUP,
    newValue: newUP,
  });

  return changes;
}

/**
 * Compare array items schema (recursive)
 */
function compareArrayItems(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldItems = oldSchema.items;
  const newItems = newSchema.items;

  // Compare single items schema
  if (isSchemaObject(oldItems) && isSchemaObject(newItems)) {
    const nestedChanges = walkInternal(oldItems, newItems, joinPath(path, 'items'), depth + 1);
    changes.push(...nestedChanges);
  } else if (oldItems !== undefined || newItems !== undefined) {
    // Items added, removed, or changed type (array to object or vice versa)
    if (!deepEqual(oldItems, newItems)) {
      // Handle tuple items (array of schemas)
      if (Array.isArray(oldItems) && Array.isArray(newItems)) {
        const maxLen = Math.max(oldItems.length, newItems.length);
        for (let i = 0; i < maxLen; i++) {
          const nestedChanges = walkInternal(
            oldItems[i],
            newItems[i],
            joinPath(path, 'items', String(i)),
            depth + 1
          );
          changes.push(...nestedChanges);
        }
      } else if (Array.isArray(oldItems) !== Array.isArray(newItems)) {
        // Structural change between tuple and list validation
        changes.push({
          path: joinPath(path, 'items'),
          type: 'items-changed',
          oldValue: oldItems,
          newValue: newItems,
        });
      } else if (oldItems === undefined || newItems === undefined) {
        changes.push({
          path: joinPath(path, 'items'),
          type: 'items-changed',
          oldValue: oldItems,
          newValue: newItems,
        });
      }
    }
  }

  // Compare prefixItems (JSON Schema draft 2020-12)
  const oldPrefixItems = oldSchema.prefixItems;
  const newPrefixItems = newSchema.prefixItems;

  if (Array.isArray(oldPrefixItems) || Array.isArray(newPrefixItems)) {
    const oldArr = oldPrefixItems ?? [];
    const newArr = newPrefixItems ?? [];
    const maxLen = Math.max(oldArr.length, newArr.length);

    for (let i = 0; i < maxLen; i++) {
      const nestedChanges = walkInternal(
        oldArr[i],
        newArr[i],
        joinPath(path, 'prefixItems', String(i)),
        depth + 1
      );
      changes.push(...nestedChanges);
    }
  }

  // Compare contains schema
  if (oldSchema.contains !== undefined || newSchema.contains !== undefined) {
    if (!deepEqual(oldSchema.contains, newSchema.contains)) {
      if (isSchemaObject(oldSchema.contains) && isSchemaObject(newSchema.contains)) {
        const nestedChanges = walkInternal(
          oldSchema.contains,
          newSchema.contains,
          joinPath(path, 'contains'),
          depth + 1
        );
        changes.push(...nestedChanges);
      } else {
        changes.push({
          path: joinPath(path, 'contains'),
          type: 'items-changed',
          oldValue: oldSchema.contains,
          newValue: newSchema.contains,
        });
      }
    }
  }

  return changes;
}

/**
 * Compare unevaluatedItems (Draft 2020-12)
 */
function compareUnevaluatedItems(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  _depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldUI = oldSchema.unevaluatedItems;
  const newUI = newSchema.unevaluatedItems;

  if (deepEqual(oldUI, newUI)) {
    return changes;
  }

  // unevaluatedItems changes require manual review
  changes.push({
    path: joinPath(path, 'unevaluatedItems'),
    type: 'unevaluated-items-changed',
    oldValue: oldUI,
    newValue: newUI,
  });

  return changes;
}

/**
 * Compare minContains and maxContains (Draft 2019-09+)
 */
function compareMinMaxContains(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string
): RawChange[] {
  const changes: RawChange[] = [];

  // Compare minContains
  const oldMinContains = oldSchema.minContains;
  const newMinContains = newSchema.minContains;

  if (oldMinContains !== newMinContains) {
    changes.push({
      path: joinPath(path, 'minContains'),
      type: 'min-contains-changed',
      oldValue: oldMinContains,
      newValue: newMinContains,
    });
  }

  // Compare maxContains
  const oldMaxContains = oldSchema.maxContains;
  const newMaxContains = newSchema.maxContains;

  if (oldMaxContains !== newMaxContains) {
    changes.push({
      path: joinPath(path, 'maxContains'),
      type: 'max-contains-changed',
      oldValue: oldMaxContains,
      newValue: newMaxContains,
    });
  }

  return changes;
}

/**
 * Compare composition keywords (anyOf, oneOf, allOf, if/then/else, not)
 *
 * Provides detailed analysis of composition changes with granular change types
 * aligned with Strands API classification.
 */
function compareComposition(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  // Compare anyOf
  changes.push(...compareAnyOf(oldSchema, newSchema, path, depth));

  // Compare oneOf
  changes.push(...compareOneOf(oldSchema, newSchema, path, depth));

  // Compare allOf
  changes.push(...compareAllOf(oldSchema, newSchema, path, depth));

  // Compare not
  changes.push(...compareNot(oldSchema, newSchema, path, depth));

  // Compare if/then/else
  changes.push(...compareIfThenElse(oldSchema, newSchema, path, depth));

  return changes;
}

/**
 * Compare anyOf composition (option additions are breaking, removals are non-breaking)
 */
function compareAnyOf(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldAnyOf = oldSchema.anyOf;
  const newAnyOf = newSchema.anyOf;

  // No anyOf in either
  if (oldAnyOf === undefined && newAnyOf === undefined) {
    return changes;
  }

  // anyOf added
  if (oldAnyOf === undefined && newAnyOf !== undefined) {
    for (let i = 0; i < newAnyOf.length; i++) {
      changes.push({
        path: joinPath(path, 'anyOf', String(i)),
        type: 'anyof-option-added',
        oldValue: undefined,
        newValue: newAnyOf[i],
      });
    }
    return changes;
  }

  // anyOf removed
  if (oldAnyOf !== undefined && newAnyOf === undefined) {
    for (let i = 0; i < oldAnyOf.length; i++) {
      changes.push({
        path: joinPath(path, 'anyOf', String(i)),
        type: 'anyof-option-removed',
        oldValue: oldAnyOf[i],
        newValue: undefined,
      });
    }
    return changes;
  }

  // Both have anyOf - compare options
  if (oldAnyOf !== undefined && newAnyOf !== undefined) {
    const matched = matchCompositionOptions(oldAnyOf, newAnyOf);

    // Report removed options
    for (const idx of matched.removed) {
      changes.push({
        path: joinPath(path, 'anyOf', String(idx)),
        type: 'anyof-option-removed',
        oldValue: oldAnyOf[idx],
        newValue: undefined,
      });
    }

    // Report added options
    for (const idx of matched.added) {
      changes.push({
        path: joinPath(path, 'anyOf', String(idx)),
        type: 'anyof-option-added',
        oldValue: undefined,
        newValue: newAnyOf[idx],
      });
    }

    // Recurse into matched options for nested changes
    for (const [oldIdx, newIdx] of matched.matched) {
      const nestedChanges = walkInternal(
        oldAnyOf[oldIdx],
        newAnyOf[newIdx],
        joinPath(path, 'anyOf', String(newIdx)),
        depth + 1
      );
      changes.push(...nestedChanges);
    }
  }

  return changes;
}

/**
 * Compare oneOf composition (option additions are breaking, removals are non-breaking)
 */
function compareOneOf(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldOneOf = oldSchema.oneOf;
  const newOneOf = newSchema.oneOf;

  // No oneOf in either
  if (oldOneOf === undefined && newOneOf === undefined) {
    return changes;
  }

  // oneOf added
  if (oldOneOf === undefined && newOneOf !== undefined) {
    for (let i = 0; i < newOneOf.length; i++) {
      changes.push({
        path: joinPath(path, 'oneOf', String(i)),
        type: 'oneof-option-added',
        oldValue: undefined,
        newValue: newOneOf[i],
      });
    }
    return changes;
  }

  // oneOf removed
  if (oldOneOf !== undefined && newOneOf === undefined) {
    for (let i = 0; i < oldOneOf.length; i++) {
      changes.push({
        path: joinPath(path, 'oneOf', String(i)),
        type: 'oneof-option-removed',
        oldValue: oldOneOf[i],
        newValue: undefined,
      });
    }
    return changes;
  }

  // Both have oneOf - compare options
  if (oldOneOf !== undefined && newOneOf !== undefined) {
    const matched = matchCompositionOptions(oldOneOf, newOneOf);

    // Report removed options
    for (const idx of matched.removed) {
      changes.push({
        path: joinPath(path, 'oneOf', String(idx)),
        type: 'oneof-option-removed',
        oldValue: oldOneOf[idx],
        newValue: undefined,
      });
    }

    // Report added options
    for (const idx of matched.added) {
      changes.push({
        path: joinPath(path, 'oneOf', String(idx)),
        type: 'oneof-option-added',
        oldValue: undefined,
        newValue: newOneOf[idx],
      });
    }

    // Recurse into matched options for nested changes
    for (const [oldIdx, newIdx] of matched.matched) {
      const nestedChanges = walkInternal(
        oldOneOf[oldIdx],
        newOneOf[newIdx],
        joinPath(path, 'oneOf', String(newIdx)),
        depth + 1
      );
      changes.push(...nestedChanges);
    }
  }

  return changes;
}

/**
 * Compare allOf composition (member additions are breaking, removals are non-breaking)
 */
function compareAllOf(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldAllOf = oldSchema.allOf;
  const newAllOf = newSchema.allOf;

  // No allOf in either
  if (oldAllOf === undefined && newAllOf === undefined) {
    return changes;
  }

  // allOf added
  if (oldAllOf === undefined && newAllOf !== undefined) {
    for (let i = 0; i < newAllOf.length; i++) {
      changes.push({
        path: joinPath(path, 'allOf', String(i)),
        type: 'allof-member-added',
        oldValue: undefined,
        newValue: newAllOf[i],
      });
    }
    return changes;
  }

  // allOf removed
  if (oldAllOf !== undefined && newAllOf === undefined) {
    for (let i = 0; i < oldAllOf.length; i++) {
      changes.push({
        path: joinPath(path, 'allOf', String(i)),
        type: 'allof-member-removed',
        oldValue: oldAllOf[i],
        newValue: undefined,
      });
    }
    return changes;
  }

  // Both have allOf - compare members
  if (oldAllOf !== undefined && newAllOf !== undefined) {
    const matched = matchCompositionOptions(oldAllOf, newAllOf);

    // Report removed members
    for (const idx of matched.removed) {
      changes.push({
        path: joinPath(path, 'allOf', String(idx)),
        type: 'allof-member-removed',
        oldValue: oldAllOf[idx],
        newValue: undefined,
      });
    }

    // Report added members
    for (const idx of matched.added) {
      changes.push({
        path: joinPath(path, 'allOf', String(idx)),
        type: 'allof-member-added',
        oldValue: undefined,
        newValue: newAllOf[idx],
      });
    }

    // Recurse into matched members for nested changes
    for (const [oldIdx, newIdx] of matched.matched) {
      const nestedChanges = walkInternal(
        oldAllOf[oldIdx],
        newAllOf[newIdx],
        joinPath(path, 'allOf', String(newIdx)),
        depth + 1
      );
      changes.push(...nestedChanges);
    }
  }

  return changes;
}

/**
 * Compare not schema (any change is breaking)
 */
function compareNot(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  _depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldNot = oldSchema.not;
  const newNot = newSchema.not;

  if (deepEqual(oldNot, newNot)) {
    return changes;
  }

  // Any change to not schema is breaking
  changes.push({
    path: joinPath(path, 'not'),
    type: 'not-schema-changed',
    oldValue: oldNot,
    newValue: newNot,
  });

  return changes;
}

/**
 * Compare if/then/else conditional schema (complex, requires manual review)
 */
function compareIfThenElse(
  oldSchema: ResolvedSchema,
  newSchema: ResolvedSchema,
  path: string,
  _depth: number
): RawChange[] {
  const changes: RawChange[] = [];

  const oldIf = oldSchema.if;
  const newIf = newSchema.if;
  const oldThen = oldSchema.then;
  const newThen = newSchema.then;
  const oldElse = oldSchema.else;
  const newElse = newSchema.else;

  // Check if any of the if/then/else keywords changed
  const ifChanged = !deepEqual(oldIf, newIf);
  const thenChanged = !deepEqual(oldThen, newThen);
  const elseChanged = !deepEqual(oldElse, newElse);

  if (ifChanged || thenChanged || elseChanged) {
    // Report as a single if-then-else-changed for simplicity
    // These are complex and require manual review
    changes.push({
      path: joinPath(path, 'if'),
      type: 'if-then-else-changed',
      oldValue: { if: oldIf, then: oldThen, else: oldElse },
      newValue: { if: newIf, then: newThen, else: newElse },
    });
  }

  return changes;
}

/**
 * Match composition options between old and new arrays
 * Uses structural similarity to find corresponding options
 */
function matchCompositionOptions(
  oldOptions: ResolvedSchema[],
  newOptions: ResolvedSchema[]
): {
  matched: Array<[number, number]>;
  removed: number[];
  added: number[];
} {
  const matched: Array<[number, number]> = [];
  const usedOld = new Set<number>();
  const usedNew = new Set<number>();

  // First pass: find exact matches
  for (let i = 0; i < oldOptions.length; i++) {
    for (let j = 0; j < newOptions.length; j++) {
      if (usedNew.has(j)) continue;
      if (deepEqual(oldOptions[i], newOptions[j])) {
        matched.push([i, j]);
        usedOld.add(i);
        usedNew.add(j);
        break;
      }
    }
  }

  // Second pass: match by position for remaining unmatched
  // This handles cases where schemas are modified but at same position
  for (let i = 0; i < oldOptions.length; i++) {
    if (usedOld.has(i)) continue;
    if (i < newOptions.length && !usedNew.has(i)) {
      // Match by position as a heuristic
      matched.push([i, i]);
      usedOld.add(i);
      usedNew.add(i);
    }
  }

  // Collect removed (in old but not matched)
  const removed: number[] = [];
  for (let i = 0; i < oldOptions.length; i++) {
    if (!usedOld.has(i)) {
      removed.push(i);
    }
  }

  // Collect added (in new but not matched)
  const added: number[] = [];
  for (let j = 0; j < newOptions.length; j++) {
    if (!usedNew.has(j)) {
      added.push(j);
    }
  }

  return { matched, removed, added };
}
