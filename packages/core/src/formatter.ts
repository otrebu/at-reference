import type { ValidationResult, ResolvedReference, FormatOptions } from './types';

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function color(text: string, colorCode: string, noColor: boolean): string {
  if (noColor) return text;
  return `${colorCode}${text}${COLORS.reset}`;
}

/**
 * Format a single reference for display
 */
function formatReference(ref: ResolvedReference, noColor: boolean): string {
  const status = ref.resolution.exists
    ? color('✓', COLORS.green, noColor)
    : color('✗', COLORS.red, noColor);

  const location = color(`${ref.line}:${ref.column}`, COLORS.dim, noColor);
  const path = ref.resolution.exists
    ? ref.path
    : color(ref.path, COLORS.red, noColor);

  let line = `  ${status} ${location} ${path}`;

  if (!ref.resolution.exists && ref.resolution.error) {
    line += `\n      ${color(ref.resolution.error, COLORS.dim, noColor)}`;
  }

  return line;
}

/**
 * Format validation results for display
 */
export function formatValidationResult(
  result: ValidationResult,
  options: FormatOptions = {}
): string {
  const { noColor = false, errorsOnly = false, showFilePath } = options;
  const lines: string[] = [];

  if (showFilePath) {
    lines.push(color(showFilePath, COLORS.cyan, noColor));
  }

  const refsToShow = errorsOnly ? result.invalid : result.references;

  for (const ref of refsToShow) {
    lines.push(formatReference(ref, noColor));
  }

  // Summary
  if (result.stats.total > 0) {
    lines.push('');
    const validText = color(`${result.stats.valid} valid`, COLORS.green, noColor);
    const invalidText =
      result.stats.invalid > 0
        ? color(`${result.stats.invalid} invalid`, COLORS.red, noColor)
        : `${result.stats.invalid} invalid`;

    lines.push(`  ${result.stats.total} references: ${validText}, ${invalidText}`);
  }

  return lines.join('\n');
}

/**
 * Format a summary of multiple file validations
 */
export function formatSummary(
  results: Array<{ file: string; result: ValidationResult }>,
  options: FormatOptions = {}
): string {
  const { noColor = false } = options;
  const lines: string[] = [];

  let totalRefs = 0;
  let totalValid = 0;
  let totalInvalid = 0;

  for (const { result } of results) {
    totalRefs += result.stats.total;
    totalValid += result.stats.valid;
    totalInvalid += result.stats.invalid;
  }

  lines.push('');
  lines.push(color('Summary', COLORS.cyan, noColor));
  lines.push(`  Files checked: ${results.length}`);
  lines.push(`  Total references: ${totalRefs}`);
  lines.push(`  Valid: ${color(String(totalValid), COLORS.green, noColor)}`);

  if (totalInvalid > 0) {
    lines.push(`  Invalid: ${color(String(totalInvalid), COLORS.red, noColor)}`);
  } else {
    lines.push(`  Invalid: ${totalInvalid}`);
  }

  return lines.join('\n');
}
