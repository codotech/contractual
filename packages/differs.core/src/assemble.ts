/**
 * Result assembly — classify, format, summarize, and compute suggestedBump
 */

import type { RawChange, Change, ChangeSeverity, DiffResult } from '@contractual/types';
import { classify, classifyPropertyAdded } from './classifiers.js';
import { formatChangeMessage } from './format.js';

export interface AssembleOptions {
  contract?: string;
  classifyFn?: (change: RawChange, newSchema: unknown) => ChangeSeverity;
}

export function assembleResult(
  rawChanges: RawChange[],
  resolvedNewSchema: unknown,
  options?: AssembleOptions
): DiffResult {
  const classifyChange = options?.classifyFn ?? defaultClassify;

  const changes: Change[] = rawChanges.map((raw) => ({
    path: raw.path,
    severity: classifyChange(raw, resolvedNewSchema),
    category: raw.type,
    message: formatChangeMessage(raw),
    oldValue: raw.oldValue,
    newValue: raw.newValue,
  }));

  const summary = {
    breaking: changes.filter((c) => c.severity === 'breaking').length,
    nonBreaking: changes.filter((c) => c.severity === 'non-breaking').length,
    patch: changes.filter((c) => c.severity === 'patch').length,
    unknown: changes.filter((c) => c.severity === 'unknown').length,
  };

  const suggestedBump =
    summary.breaking > 0
      ? 'major'
      : summary.nonBreaking > 0
        ? 'minor'
        : summary.patch > 0
          ? 'patch'
          : 'none';

  return {
    contract: options?.contract ?? '',
    changes,
    summary,
    suggestedBump,
  };
}

function defaultClassify(change: RawChange, newSchema: unknown): ChangeSeverity {
  if (change.type === 'property-added') {
    return classifyPropertyAdded(change, newSchema);
  }
  return classify(change);
}
