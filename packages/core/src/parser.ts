import type { AtReference, ParseOptions } from './types';

/**
 * Regex to match @ references.
 * Matches @ preceded by start of string, whitespace, or brackets,
 * followed by a path-like string.
 */
const AT_REFERENCE_PATTERN = /(?:^|[\s\[\(\{])(@(?:\.{0,2}\/)?[\w\-./]+)/gm;

/**
 * Regex to detect email addresses
 */
const EMAIL_PATTERN = /^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i;

/**
 * Find all code span ranges in the content (backtick enclosed regions)
 * Handles both fenced code blocks (```) and inline code (`)
 */
function findCodeSpanRanges(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  // Match fenced code blocks first (``` ... ```) as they take precedence
  const codeBlockPattern = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Match inline code (` ... `) but not inside code blocks
  // Handles single backticks with non-empty content
  const inlineCodePattern = /`[^`\n]+`/g;

  while ((match = inlineCodePattern.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    // Check if this inline code is inside a code block
    const isInsideCodeBlock = ranges.some(
      range => matchStart >= range.start && matchEnd <= range.end
    );

    if (!isInsideCodeBlock) {
      ranges.push({
        start: matchStart,
        end: matchEnd,
      });
    }
  }

  return ranges;
}

/**
 * Check if an offset falls within any code span
 */
function isInsideCodeSpan(
  offset: number,
  codeRanges: Array<{ start: number; end: number }>
): boolean {
  return codeRanges.some(range => offset >= range.start && offset < range.end);
}

/**
 * Check if a path looks like a valid reference (has / or file extension)
 */
function isValidReferencePath(path: string): boolean {
  const hasPathSeparator = path.includes('/');
  const hasExtension = /\.\w+$/.test(path);
  return hasPathSeparator || hasExtension;
}

/**
 * Check if text before match indicates this is an email
 */
function looksLikeEmail(content: string, matchStart: number): boolean {
  let i = matchStart - 1;
  while (i >= 0) {
    const char = content[i];
    if (char && /[\w.-]/.test(char)) {
      i--;
    } else {
      break;
    }
  }

  if (i < matchStart - 1) {
    const beforeAt = content.slice(i + 1, matchStart);
    const afterAt = content.slice(matchStart + 1).split(/[\s\[\]\(\)\{\}]/)[0];
    const fullMatch = `${beforeAt}@${afterAt}`;
    return EMAIL_PATTERN.test(fullMatch);
  }

  return false;
}

/**
 * Build a map of line offsets for position calculation
 */
function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/**
 * Convert character offset to line and column
 */
function offsetToPosition(
  offset: number,
  lineOffsets: number[],
  zeroIndexed: boolean
): { line: number; column: number } {
  let line = 0;
  for (let i = 0; i < lineOffsets.length; i++) {
    const lineOffset = lineOffsets[i];
    if (lineOffset !== undefined && lineOffset <= offset) {
      line = i;
    } else {
      break;
    }
  }

  const lineStart = lineOffsets[line] ?? 0;
  const column = offset - lineStart;

  const adjustment = zeroIndexed ? 0 : 1;
  return {
    line: line + adjustment,
    column: column + adjustment,
  };
}

/**
 * Extract all @ references from text content
 */
export function extractReferences(
  content: string,
  options: ParseOptions = {}
): AtReference[] {
  const { zeroIndexed = false } = options;
  const references: AtReference[] = [];
  const lineOffsets = buildLineOffsets(content);
  const codeSpanRanges = findCodeSpanRanges(content);

  AT_REFERENCE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = AT_REFERENCE_PATTERN.exec(content)) !== null) {
    const fullMatch = match[0];
    const refMatch = match[1];

    if (!refMatch) continue;

    const leadingChars = fullMatch.length - refMatch.length;
    const refStart = match.index + leadingChars;

    // Skip references inside code spans (backticks)
    if (isInsideCodeSpan(refStart, codeSpanRanges)) {
      continue;
    }

    if (looksLikeEmail(content, refStart)) {
      continue;
    }

    const path = refMatch.slice(1);

    if (!isValidReferencePath(path)) {
      continue;
    }

    const position = offsetToPosition(refStart, lineOffsets, zeroIndexed);

    references.push({
      raw: refMatch,
      path,
      startIndex: refStart,
      endIndex: refStart + refMatch.length,
      line: position.line,
      column: position.column,
    });
  }

  return references;
}
