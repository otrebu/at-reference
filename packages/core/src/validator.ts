import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ValidateOptions, ValidationResult, ResolvedReference } from './types';
import { extractReferences } from './parser';
import { resolvePath } from './resolver';

/**
 * Validate @ references in content
 */
export function validateReferences(
  content: string,
  options: ValidateOptions = {}
): ValidationResult {
  const { ignorePatterns = [], ...resolveOptions } = options;

  const references = extractReferences(content);
  const resolvedRefs: ResolvedReference[] = [];

  for (const ref of references) {
    const shouldIgnore = ignorePatterns.some((pattern) => pattern.test(ref.path));

    if (shouldIgnore) {
      continue;
    }

    const resolution = resolvePath(ref.path, resolveOptions);
    resolvedRefs.push({
      ...ref,
      resolution,
    });
  }

  const valid = resolvedRefs.filter((r) => r.resolution.exists);
  const invalid = resolvedRefs.filter((r) => !r.resolution.exists);

  return {
    references: resolvedRefs,
    valid,
    invalid,
    stats: {
      total: resolvedRefs.length,
      valid: valid.length,
      invalid: invalid.length,
    },
  };
}

/**
 * Validate @ references in a file
 */
export function validateFile(
  filePath: string,
  options: ValidateOptions = {}
): ValidationResult {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');

  const fileDir = path.dirname(absolutePath);
  const mergedOptions: ValidateOptions = {
    basePath: fileDir,
    ...options,
  };

  return validateReferences(content, mergedOptions);
}

/**
 * Quick check if a single reference is valid
 */
export function isValidReference(refPath: string, basePath?: string): boolean {
  const result = resolvePath(refPath, { basePath });
  return result.exists;
}
