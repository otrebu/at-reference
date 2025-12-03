import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ResolveOptions, ResolvedPath } from './types';

/**
 * Resolve a reference path to an absolute filesystem path
 */
export function resolvePath(
  refPath: string,
  options: ResolveOptions = {}
): ResolvedPath {
  const { basePath = process.cwd(), tryExtensions = [] } = options;

  let targetPath: string;

  if (path.isAbsolute(refPath)) {
    targetPath = refPath;
  } else if (refPath.startsWith('./') || refPath.startsWith('../')) {
    targetPath = path.resolve(basePath, refPath);
  } else if (refPath.startsWith('/')) {
    targetPath = path.resolve(basePath, '.' + refPath);
  } else {
    targetPath = path.resolve(basePath, refPath);
  }

  targetPath = path.normalize(targetPath);

  if (fs.existsSync(targetPath)) {
    return createResult(targetPath);
  }

  for (const ext of tryExtensions) {
    const withExt = targetPath + ext;
    if (fs.existsSync(withExt)) {
      return createResult(withExt);
    }
  }

  for (const ext of tryExtensions) {
    const indexPath = path.join(targetPath, `index${ext}`);
    if (fs.existsSync(indexPath)) {
      return createResult(indexPath);
    }
  }

  return {
    resolvedPath: targetPath,
    exists: false,
    isDirectory: false,
    error: `File not found: ${targetPath}`,
  };
}

function createResult(resolvedPath: string): ResolvedPath {
  try {
    const stat = fs.statSync(resolvedPath);
    return {
      resolvedPath,
      exists: true,
      isDirectory: stat.isDirectory(),
    };
  } catch {
    return {
      resolvedPath,
      exists: false,
      isDirectory: false,
      error: `Cannot stat file: ${resolvedPath}`,
    };
  }
}

/**
 * Check if a path exists
 */
export function pathExists(refPath: string, basePath?: string): boolean {
  const result = resolvePath(refPath, { basePath });
  return result.exists;
}
