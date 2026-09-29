# @contractual/differs.json-schema

Production-quality breaking change detection for JSON Schema.

Detects and classifies structural changes between JSON Schema versions, recommending semantic version bumps (major/minor/patch).

## Why?

JSON Schema has 150M+ weekly npm downloads but **no production-quality breaking change detection tool**. This package fills that gap.

## Installation

```bash
npm install @contractual/differs.json-schema
```

## Usage

### Compare Schema Files

```typescript
import { diffJsonSchema } from '@contractual/differs.json-schema';

const result = await diffJsonSchema('v1/user.schema.json', 'v2/user.schema.json');

console.log(`Suggested bump: ${result.suggestedBump}`);
console.log(`Breaking: ${result.summary.breaking}`);
console.log(`Non-breaking: ${result.summary.nonBreaking}`);

// List breaking changes
for (const change of result.changes) {
  if (change.severity === 'breaking') {
    console.log(`❌ ${change.message}`);
  }
}
```

### Compare Schema Objects

```typescript
import { diffJsonSchemaObjects } from '@contractual/differs.json-schema';

const oldSchema = { type: 'object', properties: { name: { type: 'string' } } };
const newSchema = { type: 'object', properties: { name: { type: 'number' } } };

const result = diffJsonSchemaObjects(oldSchema, newSchema);
// result.suggestedBump === 'major'
// result.changes[0].message === 'Type changed from "string" to "number"...'
```

### Quick Breaking Check

```typescript
import { hasBreakingChanges } from '@contractual/differs.json-schema';

if (hasBreakingChanges(oldSchema, newSchema)) {
  throw new Error('Breaking changes detected!');
}
```

## Change Classifications

### Breaking Changes (→ major bump)

| Category | Example |
|----------|---------|
| `property-removed` | Field deleted from schema |
| `required-added` | Existing field became required |
| `type-changed` | Type changed incompatibly |
| `type-narrowed` | Union type reduced |
| `enum-value-removed` | Enum option removed |
| `constraint-tightened` | minLength/maxLength made stricter |
| `additional-properties-denied` | Open schema closed |
| `min-items-increased` | Array minimum increased |
| `max-items-decreased` | Array maximum decreased |

### Non-Breaking Changes (→ minor bump)

| Category | Example |
|----------|---------|
| `property-added` | New optional field |
| `required-removed` | Field became optional |
| `type-widened` | Type accepts more values |
| `enum-value-added` | New enum option |
| `constraint-loosened` | Constraints relaxed |
| `additional-properties-allowed` | Closed schema opened |

### Patch Changes (→ patch bump)

| Category | Example |
|----------|---------|
| `description-changed` | Documentation updated |
| `title-changed` | Title updated |
| `default-changed` | Default value updated |
| `examples-changed` | Examples updated |

## Advanced Usage

### Resolve $refs

```typescript
import { resolveRefs } from '@contractual/differs.json-schema';

const schema = {
  type: 'object',
  properties: {
    user: { $ref: '#/$defs/User' }
  },
  $defs: {
    User: { type: 'object', properties: { name: { type: 'string' } } }
  }
};

const { schema: resolved, warnings } = resolveRefs(schema);
// resolved.properties.user === { type: 'object', properties: { name: { type: 'string' } } }
```

### Custom Classification

```typescript
import { walk, classify, CLASSIFICATION_SETS } from '@contractual/differs.json-schema';

// Get raw changes
const rawChanges = walk(resolvedOld, resolvedNew, '');

// Classify with custom rules
for (const change of rawChanges) {
  if (CLASSIFICATION_SETS.BREAKING.has(change.type)) {
    console.log('Breaking:', change.path);
  }
}
```

## Supported JSON Schema Versions

- Draft-07 (primary target)
- Draft 2019-09
- Draft 2020-12

## API Reference

### Main Functions

- `diffJsonSchema(oldPath, newPath)` - Compare two schema files
- `diffJsonSchemaObjects(oldSchema, newSchema)` - Compare two schema objects
- `hasBreakingChanges(oldSchema, newSchema)` - Quick boolean check

### Utilities

- `resolveRefs(schema)` - Resolve all $ref pointers
- `walk(oldSchema, newSchema, basePath)` - Low-level schema walker
- `classify(change)` - Classify a raw change
- `classifyPropertyAdded(change, newSchema)` - Context-aware property classification

### Types

```typescript
interface DiffResult {
  changes: Change[];
  summary: DiffSummary;
  suggestedBump: 'major' | 'minor' | 'patch' | 'none';
}

interface Change {
  path: string;
  severity: 'breaking' | 'non-breaking' | 'patch' | 'unknown';
  category: string;
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
}
```

## Part of Contractual

This package is extracted from [Contractual](https://github.com/contractual-dev/contractual), the schema contract lifecycle orchestrator.

## License

MIT
