import chalk from 'chalk';

/**
 * Print a success message with green checkmark
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Print an error message with red X
 */
export function printError(message: string): void {
  console.log(chalk.red('✗') + ' ' + message);
}

/**
 * Print a warning message with yellow warning symbol
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Print an info message with blue info symbol
 */
export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Print a simple ASCII table
 */
export function printTable(headers: string[], rows: string[][]): void {
  if (headers.length === 0) {
    return;
  }

  // Calculate column widths
  const columnWidths = headers.map((header, index) => {
    const maxRowWidth = rows.reduce((max, row) => {
      const cellLength = row[index]?.length ?? 0;
      return Math.max(max, cellLength);
    }, 0);
    return Math.max(header.length, maxRowWidth);
  });

  // Create separator line
  const separator = '+' + columnWidths.map((width) => '-'.repeat(width + 2)).join('+') + '+';

  // Format a row
  const formatRow = (cells: string[]): string => {
    return (
      '|' +
      cells.map((cell, index) => ' ' + (cell ?? '').padEnd(columnWidths[index]) + ' ').join('|') +
      '|'
    );
  };

  // Print table
  console.log(separator);
  console.log(formatRow(headers));
  console.log(separator);
  for (const row of rows) {
    console.log(formatRow(row));
  }
  console.log(separator);
}

/**
 * Format severity level with appropriate color
 */
export function formatSeverity(
  severity: 'breaking' | 'non-breaking' | 'patch' | 'unknown'
): string {
  switch (severity) {
    case 'breaking':
      return chalk.red.bold('BREAKING');
    case 'non-breaking':
      return chalk.yellow('NON-BREAKING');
    case 'patch':
      return chalk.green('PATCH');
    case 'unknown':
    default:
      return chalk.gray('UNKNOWN');
  }
}
