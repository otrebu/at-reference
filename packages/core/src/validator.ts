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
 * Recursively validate @ references and all their nested dependencies.
 *
 * This function mirrors the behavior of compileContentRecursive() but focuses
 * on validation rather than content expansion. It traverses the entire dependency
 * tree to find and validate ALL references, not just direct ones.
 *
 * @param content - The markdown content to validate
 * @param options - Validation options including currentFilePath (required)
 * @returns ValidationResult with all references from entire dependency tree
 */
export function validateReferencesRecursive(
  content: string,
  options: ValidateOptions & {
    currentFilePath: string;
  }
): ValidationResult {
  const { ignorePatterns = [], currentFilePath, ...resolveOptions } = options;

  // Initialize tracking structures
  const visitedPaths = options._visitedPaths || new Set<string>();
  const allResolvedRefs: ResolvedReference[] = [];

  // Prevent infinite loops - check if we've already visited this file
  let realPath: string;
  try {
    realPath = fs.realpathSync(currentFilePath);
  } catch {
    // If realpathSync fails, use the original path
    realPath = currentFilePath;
  }

  if (visitedPaths.has(realPath)) {
    return {
      references: [],
      valid: [],
      invalid: [],
      stats: {
        total: 0,
        valid: 0,
        invalid: 0,
      },
    };
  }

  visitedPaths.add(realPath);

  // Extract and resolve references from current file
  const references = extractReferences(content);

  for (const ref of references) {
    // Skip ignored patterns
    const shouldIgnore = ignorePatterns.some((pattern) => pattern.test(ref.path));
    if (shouldIgnore) {
      continue;
    }

    // Resolve path
    const resolution = resolvePath(ref.path, {
      basePath: resolveOptions.basePath || path.dirname(currentFilePath),
      tryExtensions: resolveOptions.tryExtensions,
    });

    const resolvedRef: ResolvedReference = {
      ...ref,
      resolution,
    };

    allResolvedRefs.push(resolvedRef);

    // Recurse into valid files not yet visited
    if (resolution.exists && !resolution.isDirectory) {
      let realImportPath: string;
      try {
        realImportPath = fs.realpathSync(resolution.resolvedPath);
      } catch {
        realImportPath = resolution.resolvedPath;
      }

      if (!visitedPaths.has(realImportPath)) {
        try {
          const fileContent = fs.readFileSync(resolution.resolvedPath, 'utf-8');

          const nestedResult = validateReferencesRecursive(fileContent, {
            ...options,
            currentFilePath: resolution.resolvedPath,
            basePath: resolveOptions.basePath, // Preserve workspace root
            _visitedPaths: visitedPaths, // Share visited set
          });

          // Accumulate nested references
          allResolvedRefs.push(...nestedResult.references);
        } catch (err) {
          // File read error - skip recursion
          // Error is already tracked in resolution if it failed to resolve
        }
      }
    }
  }

  // Split valid/invalid and return
  const valid = allResolvedRefs.filter((r) => r.resolution.exists);
  const invalid = allResolvedRefs.filter((r) => !r.resolution.exists);

  return {
    references: allResolvedRefs,
    valid,
    invalid,
    stats: {
      total: allResolvedRefs.length,
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
    currentFilePath: absolutePath,
  };

  // Branch: shallow vs recursive validation
  if (options.shallow) {
    return validateReferences(content, mergedOptions);
  } else {
    // TypeScript: currentFilePath is guaranteed to be set above
    return validateReferencesRecursive(content, mergedOptions as ValidateOptions & { currentFilePath: string });
  }
}

/**
 * Quick check if a single reference is valid
 */
export function isValidReference(refPath: string, basePath?: string): boolean {
  const result = resolvePath(refPath, { basePath });
  return result.exists;
}
