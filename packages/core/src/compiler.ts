import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractReferences, stripFrontMatter } from './parser';
import { resolvePath } from './resolver';
import type { AtReference, ResolveOptions } from './types';
import { buildDependencyGraph, topologicalSort, type DependencyGraph } from './dependency-graph';
import { adjustHeadings, analyzeHeadingContext, normalizeHeadings } from './heading-adjuster';

/**
 * Options for compiling @ references
 */
export interface CompileOptions extends ResolveOptions {
  /** Output file path (default: input file with .built suffix) */
  outputPath?: string;
  /** Whether to write the output file (default: true) */
  writeOutput?: boolean;
  /** Custom wrapper for file content (default: XML tags) */
  contentWrapper?: (content: string, filePath: string, ref: AtReference) => string;
  /** Only import each file once, use references for duplicates */
  optimizeDuplicates?: boolean;
  /**
   * Heading adjustment mode:
   * - 'normalize' (default): Preserves relative heading hierarchy within imported files.
   *   First heading of imported content is normalized to context level + 1.
   * - 'additive': Legacy mode that adds context level to all headings cumulatively.
   */
  headingMode?: 'normalize' | 'additive';
}

/**
 * Options for folder compilation
 */
export interface FolderCompileOptions extends CompileOptions {
  /** Output directory (default: inputDir/dist) */
  outputDir?: string;
  /** Whether to preserve source directory structure (default: true) */
  preserveStructure?: boolean;
}

/**
 * Result of compiling a folder
 */
export interface FolderCompileResult {
  /** Input directory path */
  inputDir: string;
  /** Output directory path */
  outputDir: string;
  /** Individual file compilation results */
  results: CompileResult[];
  /** Total files compiled */
  totalFiles: number;
  /** Total references resolved */
  totalReferences: number;
  /** Total failures */
  totalFailures: number;
  /** Dependency graph used for compilation */
  graph: DependencyGraph;
  /** Files that had circular dependencies */
  circularFiles: string[];
  /** Compilation duration in milliseconds */
  duration: number;
}

/**
 * Result of a single reference compilation
 */
export interface CompiledReference {
  /** The original reference */
  reference: AtReference;
  /** The resolved file path */
  resolvedPath: string;
  /** Whether the file was found */
  found: boolean;
  /** The file content (if found) */
  content?: string;
  /** Error message (if not found) */
  error?: string;
  /** Whether this reference was skipped due to circular dependency */
  circular?: boolean;
  /** Number of times this file has been imported */
  importCount?: number;
  /** Parent file path that imported this reference */
  importedFrom?: string;
}

/**
 * Statistics about file imports during compilation
 */
export interface ImportStats {
  /** Map of file path to number of times it was imported */
  fileImportCounts: Map<string, number>;
  /** Array of files that were imported more than once */
  duplicateFiles: string[];
}

/**
 * Result of compiling a file
 */
export interface CompileResult {
  /** Original file path */
  inputPath: string;
  /** Output file path */
  outputPath: string;
  /** The compiled content */
  compiledContent: string;
  /** All references that were processed */
  references: CompiledReference[];
  /** Number of successfully resolved references */
  successCount: number;
  /** Number of failed references */
  failedCount: number;
  /** Whether output was written */
  written: boolean;
  /** Statistics about file imports */
  importStats: ImportStats;
}

/**
 * Get file extension for syntax highlighting
 */
function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.sql': 'sql',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.lua': 'lua',
    '.vim': 'vim',
    '.dockerfile': 'dockerfile',
    '.toml': 'toml',
    '.ini': 'ini',
    '.conf': 'conf',
  };
  return langMap[ext] || '';
}

/**
 * Default content wrapper - wraps in XML tags
 */
function defaultContentWrapper(content: string, filePath: string, _ref: AtReference): string {
  return `<file path="${filePath}">\n\n${content}\n\n</file>`;
}

/**
 * Reference wrapper - lightweight self-closing reference to already-imported file
 */
function referenceWrapper(filePath: string): string {
  return `<file path="${filePath}" />`;
}

/**
 * Find line boundaries for a reference to replace entire line
 */
function getLineBoundaries(content: string, refStart: number, refEnd: number): { start: number; end: number } {
  // Find start of line (previous newline or start of string)
  let lineStart = refStart;
  while (lineStart > 0 && content[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // Find end of line (next newline or end of string)
  let lineEnd = refEnd;
  while (lineEnd < content.length && content[lineEnd] !== '\n') {
    lineEnd++;
  }

  return { start: lineStart, end: lineEnd };
}

/**
 * Generate output path with .built suffix
 */
export function getBuiltOutputPath(inputPath: string): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  return path.join(dir, `${base}.built${ext}`);
}

/**
 * Recursively compile content, resolving @references and their nested references
 *
 * @param headingContext Interpretation depends on headingMode:
 *   - 'normalize' mode: Parent context level (-1 = root file, don't normalize; >= 0 = normalize to contextLevel + 1)
 *   - 'additive' mode: Cumulative heading shift to apply
 */
function compileContentRecursive(
  content: string,
  currentFilePath: string,
  options: CompileOptions,
  pathStack: string[],
  importCounts: Map<string, number>,
  importedFiles: Set<string>,
  headingContext: number = -1
): { compiledContent: string; references: CompiledReference[] } {
  const {
    basePath = path.dirname(currentFilePath),
    contentWrapper = defaultContentWrapper,
    tryExtensions = [],
    optimizeDuplicates = false,
    headingMode = 'normalize',
  } = options;

  // Always strip front matter
  const processedContent = stripFrontMatter(content);

  const references = extractReferences(processedContent);
  const compiledRefs: CompiledReference[] = [];

  // Analyze heading context for each reference
  const contextMap = analyzeHeadingContext(processedContent, references);

  // Use processedContent for compilation
  let compiledContent = processedContent;

  // Pre-scan references in forward order to mark which specific refs should be full imports
  // (first occurrence of each file gets full content, rest get references)
  // IMPORTANT: Check importedFiles to respect files already imported in parent scope
  const firstOccurrenceIndices = new Set<number>();
  if (optimizeDuplicates) {
    const seenPaths = new Set<string>();
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      if (!ref) continue;
      const resolved = resolvePath(ref.path, { basePath, tryExtensions });
      if (resolved.exists && !resolved.isDirectory) {
        // Only mark as first if NOT already imported in parent AND not seen in this file
        if (!importedFiles.has(resolved.resolvedPath) && !seenPaths.has(resolved.resolvedPath)) {
          firstOccurrenceIndices.add(ref.startIndex); // Track by position
          seenPaths.add(resolved.resolvedPath);
        }
      }
    }
  }

  // Sort references by startIndex in reverse order to replace from end to start
  // This ensures indices remain valid as we modify the string
  const sortedRefs = [...references].sort((a, b) => b.startIndex - a.startIndex);

  for (const ref of sortedRefs) {
    const resolved = resolvePath(ref.path, { basePath, tryExtensions });

    const compiledRef: CompiledReference = {
      reference: ref,
      resolvedPath: resolved.resolvedPath,
      found: resolved.exists && !resolved.isDirectory,
    };

    // Check for circular dependency (only if file is in current path stack)
    if (pathStack.includes(resolved.resolvedPath)) {
      compiledRef.found = false;
      compiledRef.circular = true;
      compiledRef.error = `Circular dependency detected: ${resolved.resolvedPath}`;
      compiledRefs.push(compiledRef);
      continue;
    }

    if (resolved.exists && !resolved.isDirectory) {
      try {
        // Track import count
        const currentCount = importCounts.get(resolved.resolvedPath) || 0;
        importCounts.set(resolved.resolvedPath, currentCount + 1);

        compiledRef.importCount = currentCount + 1;
        compiledRef.importedFrom = currentFilePath;

        // Check if this specific reference is marked as first occurrence
        const isFirstOccurrence = firstOccurrenceIndices.has(ref.startIndex);

        if (optimizeDuplicates && !isFirstOccurrence) {
          // Use lightweight reference instead of full content (not first occurrence)
          const refTag = referenceWrapper(resolved.resolvedPath);
          compiledContent =
            compiledContent.slice(0, ref.startIndex) +
            refTag +
            compiledContent.slice(ref.endIndex);

          compiledRef.content = ''; // Mark as optimized
        } else {
          // First import - include full content
          importedFiles.add(resolved.resolvedPath);

          let fileContent = fs.readFileSync(resolved.resolvedPath, 'utf-8');

          // Calculate heading context for this import based on mode
          const localContext = contextMap.get(ref.startIndex);
          const localContextLevel = localContext?.contextLevel ?? 0;

          // In normalize mode: pass the local context level (not cumulative)
          // In additive mode: pass cumulative shift (headingContext + localContextLevel)
          const childHeadingContext = headingMode === 'additive'
            ? headingContext + localContextLevel
            : localContextLevel;

          // Add to path stack for circular detection
          const newPathStack = [...pathStack, resolved.resolvedPath];

          // Recursively compile the referenced file's content
          // Preserve basePath to maintain workspace-root-relative resolution
          const nestedResult = compileContentRecursive(
            fileContent,
            resolved.resolvedPath,
            options,
            newPathStack,
            importCounts,
            importedFiles,
            childHeadingContext
          );

          // Use the recursively compiled content
          fileContent = nestedResult.compiledContent;

          compiledRef.content = fileContent;

          // Add nested references to our list
          compiledRefs.push(...nestedResult.references);

          const wrapped = contentWrapper(fileContent, resolved.resolvedPath, ref);
          compiledContent =
            compiledContent.slice(0, ref.startIndex) +
            wrapped +
            compiledContent.slice(ref.endIndex);
        }
      } catch (err) {
        compiledRef.found = false;
        compiledRef.error = err instanceof Error ? err.message : 'Unknown error reading file';
      }
    } else if (resolved.isDirectory) {
      compiledRef.found = false;
      compiledRef.error = 'Path is a directory, not a file';
    } else {
      compiledRef.error = resolved.error || 'File not found';
    }

    compiledRefs.push(compiledRef);
  }

  // Reverse to get original order
  compiledRefs.reverse();

  // Apply heading adjustment after all references are expanded
  if (headingMode === 'additive') {
    // Additive mode: shift by cumulative amount, skip headings in <file> blocks (already adjusted)
    if (headingContext > 0) {
      compiledContent = adjustHeadings(compiledContent, headingContext, true, true);
    }
  } else {
    // Normalize mode: normalize to target level = contextLevel + 1
    // headingContext >= 0 means this is an imported file (not root which has -1)
    // skipFileBlocks = false so nested imports ARE re-adjusted (normalization cascades)
    if (headingContext >= 0) {
      const targetLevel = headingContext + 1;
      compiledContent = normalizeHeadings(compiledContent, targetLevel, true, false);
    }
  }

  return { compiledContent, references: compiledRefs };
}

/**
 * Internal compile function that accepts external cache maps
 * Allows sharing import tracking across multiple file compilations
 */
function compileFileWithCache(
  filePath: string,
  options: CompileOptions & {
    importCounts?: Map<string, number>;
    importedFiles?: Set<string>;
  } = {}
): CompileResult {
  const {
    outputPath = getBuiltOutputPath(filePath),
    writeOutput = true,
    importCounts = new Map<string, number>(),
    importedFiles = new Set<string>(),
  } = options;

  const absoluteInputPath = path.resolve(filePath);
  const content = fs.readFileSync(absoluteInputPath, 'utf-8');

  // Initialize path stack with root file for circular detection
  const pathStack = [absoluteInputPath];

  // Use the file's directory as the base path for resolution
  const effectiveBasePath = options.basePath ?? path.dirname(absoluteInputPath);

  // Initial heading context:
  // - For normalize mode: -1 means root file (don't normalize the root)
  // - For additive mode: 0 means no cumulative shift yet
  const headingMode = options.headingMode ?? 'normalize';
  const initialHeadingContext = headingMode === 'additive' ? 0 : -1;

  const { compiledContent, references: compiledRefs } = compileContentRecursive(
    content,
    absoluteInputPath,
    { ...options, basePath: effectiveBasePath },
    pathStack,
    importCounts,
    importedFiles,
    initialHeadingContext
  );

  const successCount = compiledRefs.filter(r => r.found).length;
  const failedCount = compiledRefs.filter(r => !r.found).length;

  // Generate import statistics
  const duplicateFiles = Array.from(importCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([file, _]) => file);

  const importStats: ImportStats = {
    fileImportCounts: importCounts,
    duplicateFiles
  };

  let written = false;
  if (writeOutput) {
    const absoluteOutputPath = path.resolve(outputPath);
    fs.writeFileSync(absoluteOutputPath, compiledContent, 'utf-8');
    written = true;
  }

  return {
    inputPath: absoluteInputPath,
    outputPath: path.resolve(outputPath),
    compiledContent,
    references: compiledRefs,
    successCount,
    failedCount,
    written,
    importStats,
  };
}

/**
 * Compile a single file, resolving all @ references recursively
 */
export function compileFile(filePath: string, options: CompileOptions = {}): CompileResult {
  // Create local cache for single-file compilation
  const importCounts = new Map<string, number>();
  const importedFiles = new Set<string>();

  return compileFileWithCache(filePath, {
    ...options,
    importCounts,
    importedFiles
  });
}

/**
 * Compile content string without file I/O (useful for VSCode extension)
 * Recursively resolves all @references including nested ones
 */
export function compileContent(
  content: string,
  options: CompileOptions = {}
): { compiledContent: string; references: CompiledReference[] } {
  const {
    basePath = process.cwd(),
  } = options;

  // Use the recursive compiler with a virtual file path based on basePath
  const virtualFilePath = path.join(basePath, '__virtual__.md');

  // Initialize path stack (empty for virtual content)
  const pathStack: string[] = [];

  // Initialize import counts map
  const importCounts = new Map<string, number>();

  // Initialize imported files set for optimization
  const importedFiles = new Set<string>();

  // Initial heading context based on mode
  const headingMode = options.headingMode ?? 'normalize';
  const initialHeadingContext = headingMode === 'additive' ? 0 : -1;

  return compileContentRecursive(
    content,
    virtualFilePath,
    { ...options, basePath },
    pathStack,
    importCounts,
    importedFiles,
    initialHeadingContext
  );
}

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Compile all markdown files in a directory with bottom-up dependency ordering
 */
export function compileFolder(
  inputDir: string,
  options: FolderCompileOptions = {}
): FolderCompileResult {
  const startTime = Date.now();

  const absoluteInputDir = path.resolve(inputDir);
  const outputDir = options.outputDir || path.join(absoluteInputDir, 'dist');
  const preserveStructure = options.preserveStructure ?? true;

  // Find all markdown files
  const markdownFiles = findMarkdownFiles(absoluteInputDir);

  if (markdownFiles.length === 0) {
    return {
      inputDir: absoluteInputDir,
      outputDir,
      results: [],
      totalFiles: 0,
      totalReferences: 0,
      totalFailures: 0,
      graph: { nodes: new Map(), rootFiles: new Set(), errors: [] },
      circularFiles: [],
      duration: Date.now() - startTime
    };
  }

  // Build dependency graph
  const graph = buildDependencyGraph(markdownFiles, {
    basePath: options.basePath,
    tryExtensions: options.tryExtensions
  });

  // Topologically sort files (dependencies before dependents)
  const { sorted } = topologicalSort(graph);

  // Initialize global cache (shared across all files)
  const globalImportCounts = new Map<string, number>();
  const globalImportedFiles = new Set<string>();

  // Compile files in dependency order
  const results: CompileResult[] = [];

  for (const filePath of sorted) {
    // Calculate output path
    let outputPath: string;
    if (preserveStructure) {
      const relativePath = path.relative(absoluteInputDir, filePath);
      outputPath = path.join(outputDir, relativePath);
    } else {
      outputPath = path.join(outputDir, path.basename(filePath));
    }

    // Ensure output directory exists
    const outputDirPath = path.dirname(outputPath);
    fs.mkdirSync(outputDirPath, { recursive: true });

    // Compile with shared cache
    try {
      const result = compileFileWithCache(filePath, {
        ...options,
        outputPath,
        writeOutput: true,
        importCounts: globalImportCounts,
        importedFiles: globalImportedFiles
      });

      results.push(result);
    } catch (error) {
      // Record compilation failure
      results.push({
        inputPath: filePath,
        outputPath,
        compiledContent: '',
        references: [],
        successCount: 0,
        failedCount: 1,
        written: false,
        importStats: {
          fileImportCounts: new Map(),
          duplicateFiles: []
        }
      });
    }
  }

  // Aggregate statistics
  const totalFiles = results.length;
  const totalReferences = results.reduce((sum, r) => sum + r.references.length, 0);
  const totalFailures = results.reduce((sum, r) => sum + r.failedCount, 0);

  // Find files involved in circular dependencies
  const circularFiles = results
    .flatMap(r => r.references.filter(ref => ref.circular).map(ref => ref.resolvedPath))
    .filter((v, i, a) => a.indexOf(v) === i); // unique

  return {
    inputDir: absoluteInputDir,
    outputDir,
    results,
    totalFiles,
    totalReferences,
    totalFailures,
    graph,
    circularFiles,
    duration: Date.now() - startTime
  };
}
