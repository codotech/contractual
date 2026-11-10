import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BumpResult } from '@contractual/types';

/**
 * Format a date as YYYY-MM-DD
 * @param date - The date to format
 * @returns The formatted date string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a single bump result as a changelog entry
 */
function formatBumpEntry(bump: BumpResult, date: Date): string {
  const dateStr = formatDate(date);
  const header = `## [${bump.contract}] v${bump.newVersion} - ${dateStr}`;
  const changes = bump.changes.trim();

  return `${header}\n\n${changes}`;
}

/**
 * Append version bump entries to CHANGELOG.md
 * Creates the file if it doesn't exist.
 * Inserts entries after the "# Changelog" heading, or at the top if no heading.
 * @param changelogPath - Path to the CHANGELOG.md file
 * @param bumps - Array of bump results to append
 */
export function appendChangelog(changelogPath: string, bumps: BumpResult[]): void {
  if (bumps.length === 0) {
    return;
  }

  const date = new Date();
  const newEntries = bumps
    .map((bump) => formatBumpEntry(bump, date))
    .join('\n\n');

  if (!existsSync(changelogPath)) {
    // Create new changelog with header and entries
    const content = `# Changelog\n\n${newEntries}\n`;
    writeFileSync(changelogPath, content, 'utf-8');
    return;
  }

  const existingContent = readFileSync(changelogPath, 'utf-8');
  const changelogHeading = '# Changelog';
  const headingIndex = existingContent.indexOf(changelogHeading);

  let newContent: string;

  if (headingIndex !== -1) {
    // Insert after the heading line
    const afterHeading = headingIndex + changelogHeading.length;
    const beforeHeading = existingContent.slice(0, afterHeading);
    const afterContent = existingContent.slice(afterHeading);

    // Preserve any blank lines after heading, then insert entries
    const leadingWhitespaceMatch = afterContent.match(/^(\r?\n)*/);
    const leadingWhitespace = leadingWhitespaceMatch?.[0] ?? '\n\n';

    newContent = `${beforeHeading}\n\n${newEntries}${leadingWhitespace.length > 2 ? leadingWhitespace : '\n\n'}${afterContent.trimStart()}`;
  } else {
    // No heading found, prepend entries with heading
    newContent = `# Changelog\n\n${newEntries}\n\n${existingContent}`;
  }

  writeFileSync(changelogPath, newContent, 'utf-8');
}
