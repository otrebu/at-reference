import type {
  ValidationResult,
  ResolvedReference,
  FormatOptions,
  BrokenReferenceByTarget,
} from './types';
import * as path from 'node:path';

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

/**
 * Extract broken references grouped by target from validation results
 */
export function extractBrokenReferencesByTarget(
  results: Array<{ file: string; result: ValidationResult }>,
  cwd: string = process.cwd()
): BrokenReferenceByTarget[] {
  const brokenByTarget = new Map<
    string,
    {
      targetPath: string;
      raw: string;
      error: string;
      sources: Array<{ file: string; line: number; column: number }>;
    }
  >();

  for (const { file, result } of results) {
    for (const ref of result.invalid) {
      const targetPath = ref.resolution.resolvedPath;

      if (!brokenByTarget.has(targetPath)) {
        brokenByTarget.set(targetPath, {
          targetPath,
          raw: ref.raw,
          error: ref.resolution.error || 'File not found',
          sources: [],
        });
      }

      brokenByTarget.get(targetPath)!.sources.push({
        file,
        line: ref.line,
        column: ref.column,
      });
    }
  }

  return Array.from(brokenByTarget.values());
}

/**
 * Format broken references grouped by target path
 */
export function formatBrokenReferencesByTarget(
  brokenRefs: BrokenReferenceByTarget[],
  options: { noColor?: boolean; cwd?: string } = {}
): string {
  const { noColor = false, cwd = process.cwd() } = options;

  if (brokenRefs.length === 0) return '';

  const lines: string[] = [];
  lines.push('');
  lines.push(color('Broken References:', COLORS.red, noColor));
  lines.push('');

  // Sort alphabetically by target path for consistency
  const sorted = [...brokenRefs].sort((a, b) => a.targetPath.localeCompare(b.targetPath));

  for (const broken of sorted) {
    // Header: the broken @reference
    lines.push(`  ${color(broken.raw, COLORS.red, noColor)}`);

    // Subheader: error message (dim)
    lines.push(`    ${color(broken.error, COLORS.dim, noColor)}`);

    // List source files with line/col
    for (const source of broken.sources) {
      const relativePath = path.relative(cwd, source.file) || source.file;
      const location = color(`(line ${source.line}, col ${source.column})`, COLORS.dim, noColor);
      lines.push(`      ${relativePath} ${location}`);
    }

    lines.push(''); // Blank line between targets
  }

  return lines.join('\n');
}

/**
 * Format validation summary for multiple files (compact mode)
 */
export function formatValidationSummary(
  results: Array<{ file: string; result: ValidationResult }>,
  options: {
    noColor?: boolean;
    mode: 'recursive' | 'shallow';
    duration?: number;
    cwd?: string;
  }
): string {
  const { noColor = false, mode, duration, cwd } = options;
  const lines: string[] = [];

  // Aggregate stats
  let totalRefs = 0;
  let totalValid = 0;
  let totalInvalid = 0;

  for (const { result } of results) {
    totalRefs += result.stats.total;
    totalValid += result.stats.valid;
    totalInvalid += result.stats.invalid;
  }

  // Header with mode indicator
  const modeLabel = mode === 'recursive' ? 'recursive' : 'shallow';
  lines.push(color(`Validation complete (${modeLabel})`, COLORS.cyan, noColor));
  lines.push('');

  // Files count
  lines.push(`  ${color('Files:', COLORS.dim, noColor)}  ${results.length} markdown file${results.length === 1 ? '' : 's'}`);
  lines.push('');

  // References summary with scope note
  const scopeNote = mode === 'recursive'
    ? '(across dependency trees)'
    : '(direct references only)';

  lines.push(`  ${totalRefs} references validated ${color(scopeNote, COLORS.dim, noColor)}`);

  const validText = color(`${totalValid} valid`, COLORS.green, noColor);
  const invalidText = totalInvalid > 0
    ? color(`${totalInvalid} invalid`, COLORS.red, noColor)
    : `${totalInvalid} invalid`;

  lines.push(`    ${validText}, ${invalidText}`);

  // Duration
  if (duration !== undefined) {
    lines.push('');
    lines.push(`  ${color('Duration:', COLORS.dim, noColor)} ${duration}ms`);
  }

  // Broken references by target
  if (totalInvalid > 0) {
    const brokenByTarget = extractBrokenReferencesByTarget(results, cwd);
    const brokenOutput = formatBrokenReferencesByTarget(brokenByTarget, {
      noColor,
      cwd,
    });
    if (brokenOutput) {
      lines.push(brokenOutput);
    }
  }

  lines.push('');

  // Status message with helpful tips
  if (totalInvalid === 0) {
    lines.push(color('✓ All references are valid!', COLORS.green, noColor));
  } else {
    lines.push(color(`⚠️  ${totalInvalid} broken reference${totalInvalid === 1 ? '' : 's'} found`, COLORS.yellow, noColor));
    lines.push('');
    lines.push(color('💡 Use --detailed to see per-file breakdown', COLORS.dim, noColor));

    if (mode === 'recursive') {
      lines.push(color('💡 Use --shallow for faster validation of direct refs only', COLORS.dim, noColor));
    } else {
      lines.push(color('ℹ️  Shallow mode only checks direct @references, not nested dependencies', COLORS.dim, noColor));
    }
  }

  return lines.join('\n');
}
