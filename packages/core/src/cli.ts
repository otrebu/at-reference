#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFile } from './validator';
import {
  formatValidationResult,
  formatSummary,
  formatValidationSummary,
  formatBrokenReferencesByTarget,
  extractBrokenReferencesByTarget,
} from './formatter';
import { compileFile, compileFolder, getBuiltOutputPath } from './compiler';
import type { ValidationResult, BrokenReferenceByTarget } from './types';
import type { CompileResult, FolderCompileResult } from './compiler';
import { buildReferenceTree, formatTree } from './tree-formatter';

/**
 * Find workspace root by looking for .git directory
 */
function findWorkspaceRoot(startPath: string, explicitRoot?: string): string {
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  let current = startPath;
  while (current !== path.dirname(current)) {
    const gitPath = path.join(current, '.git');
    if (fs.existsSync(gitPath)) {
      return current;
    }
    current = path.dirname(current);
  }
  return startPath; // fallback to document dir
}

interface CliOptions {
  files: string[];
  noColor: boolean;
  quiet: boolean;
  ignore: string[];
  workspaceRootPath?: string;
  shallow: boolean;
  summary: boolean;
  verbose: boolean;
  help: boolean;
}

interface CompileCliOptions {
  files: string[];
  output?: string;
  outputDir?: string;
  noColor: boolean;
  workspaceRootPath?: string;
  optimizeDuplicates: boolean;
  additiveHeadings: boolean;
  verbose: boolean;
  help: boolean;
}

interface CheckCliOptions {
  path: string;
  noColor: boolean;
  ignore: string[];
  workspaceRootPath?: string;
  verbose: boolean;
  help: boolean;
}

const HELP_TEXT = `
at-ref - Validate @path/to/file references

Usage:
  at-ref <files...> [options]
  at-ref check [path] [options]
  at-ref compile <files...> [options]

Commands:
  (default)      Validate @ references in files
  check          Scan all .md files and list broken links by file
  compile        Compile files by expanding @ references

Validation Options:
  --verbose, -v           Show all references (valid + broken)
  --shallow               Fast, non-recursive validation (direct refs only)
  --summary, -s           Show compact summary instead of per-file details
  --no-color              Disable colored output
  --quiet                 Only show errors (incompatible with --summary)
  --ignore <p>            Ignore pattern (can be used multiple times)
  --workspace-root-path   Explicit workspace root path
  --help                  Show this help message

Check Options:
  --verbose, -v           Show all references (valid + broken) per file
  --no-color              Disable colored output
  --ignore <p>            Ignore pattern (can be used multiple times)
  --workspace-root-path   Explicit workspace root path
  --help                  Show this help message

Compile Options:
  --output <path>         Output file (single file only)
  --output-dir <path>     Output directory (folder mode, default: dist/)
  --dist <path>           Alias for --output-dir
  --optimize-duplicates   Only import each file once, use references for duplicates
  --additive-headings     Use legacy additive heading shift (default: normalize)
  --no-color              Disable colored output
  --workspace-root-path   Explicit workspace root path
  --help                  Show this help message

Examples:
  at-ref CLAUDE.md                             # Shows detailed view
  at-ref docs/                                 # Shows per-file breakdown (default)
  at-ref docs/ --summary                       # Shows compact stats (like compile)
  at-ref docs/ --summary --shallow             # Fast summary (direct refs)
  at-ref docs/ --quiet                         # Only files with errors
  at-ref . --quiet
  at-ref README.md --ignore "node_modules"

  at-ref check
  at-ref check docs/
  at-ref check --ignore "vendor"

  at-ref compile CLAUDE.md
  at-ref compile CLAUDE.md --output CLAUDE.compiled.md
  at-ref compile docs/
  at-ref compile docs/ --output-dir build/ --optimize-duplicates
`;

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    files: [],
    noColor: false,
    quiet: false,
    ignore: [],
    shallow: false,
    summary: false,
    verbose: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--shallow') {
      options.shallow = true;
    } else if (arg === '--summary' || arg === '-s') {
      options.summary = true;
    } else if (arg === '--ignore') {
      i++;
      const pattern = args[i];
      if (pattern) {
        options.ignore.push(pattern);
      }
    } else if (arg === '--workspace-root-path') {
      i++;
      const rootPath = args[i];
      if (rootPath) {
        options.workspaceRootPath = rootPath;
      }
    } else if (arg && !arg.startsWith('-')) {
      options.files.push(arg);
    }

    i++;
  }

  return options;
}

// Node 22+ has globSync but types may not include it
const globSync = (fs as unknown as { globSync?: (pattern: string) => string[] }).globSync;

function expandGlobs(patterns: string[]): string[] {
  const files: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Use fs.globSync if available (Node 22+), otherwise simple expansion
      try {
        if (globSync) {
          const globbed = globSync(pattern);
          files.push(...globbed);
        } else {
          files.push(pattern);
        }
      } catch {
        // Fallback: treat as literal path
        files.push(pattern);
      }
    } else if (fs.existsSync(pattern)) {
      const stat = fs.statSync(pattern);
      if (stat.isDirectory()) {
        // Recursively find .md files in directory
        const mdFiles = findMarkdownFiles(pattern);
        files.push(...mdFiles);
      } else {
        files.push(pattern);
      }
    } else {
      files.push(pattern);
    }
  }

  return [...new Set(files)]; // Dedupe
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function parseCompileArgs(args: string[]): CompileCliOptions {
  const options: CompileCliOptions = {
    files: [],
    noColor: false,
    optimizeDuplicates: false,
    additiveHeadings: false,
    verbose: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--optimize-duplicates') {
      options.optimizeDuplicates = true;
    } else if (arg === '--additive-headings') {
      options.additiveHeadings = true;
    } else if (arg === '--output' || arg === '-o') {
      i++;
      const outputPath = args[i];
      if (outputPath) {
        options.output = outputPath;
      }
    } else if (arg === '--output-dir' || arg === '--dist') {
      i++;
      const outputDir = args[i];
      if (outputDir) {
        options.outputDir = outputDir;
      }
    } else if (arg === '--workspace-root-path') {
      i++;
      const rootPath = args[i];
      if (rootPath) {
        options.workspaceRootPath = rootPath;
      }
    } else if (arg && !arg.startsWith('-')) {
      options.files.push(arg);
    }

    i++;
  }

  return options;
}

// Color helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function formatCompileResult(result: CompileResult, noColor: boolean, verbose: boolean = false): string {
  const c = noColor
    ? { reset: '', green: '', red: '', yellow: '', cyan: '', dim: '' }
    : colors;

  const lines: string[] = [];

  // Header
  lines.push(`${c.cyan}# ${path.basename(result.inputPath)}${c.reset}`);
  lines.push('');

  // Tree output only in verbose mode
  if (verbose && result.references.length > 0) {
    lines.push(`${c.cyan}Resolved files:${c.reset}`);
    const tree = buildReferenceTree(result.references, result.inputPath);
    lines.push(formatTree(tree, { noColor }));
    lines.push('');
  }

  // Summary with duplicates
  const summary: string[] = [];
  if (result.successCount > 0) {
    summary.push(`${c.green}${result.successCount} resolved${c.reset}`);
  }
  if (result.failedCount > 0) {
    summary.push(`${c.red}${result.failedCount} failed${c.reset}`);
  }
  if (result.importStats.duplicateFiles.length > 0) {
    summary.push(`${c.yellow}${result.importStats.duplicateFiles.length} duplicates${c.reset}`);
  }

  lines.push(`${c.cyan}Summary:${c.reset} ${summary.join(', ')}`);

  if (result.written) {
    lines.push(`${c.green}✓${c.reset} Output written to ${result.outputPath}`);
  }

  return lines.join('\n');
}

function findCommonAncestor(paths: string[]): string {
  if (paths.length === 0) return process.cwd();
  if (paths.length === 1) return path.dirname(path.resolve(paths[0]!));

  const resolved = paths.map(p => path.resolve(p));
  const parts = resolved.map(p => p.split(path.sep));

  let commonParts: string[] = [];
  for (let i = 0; i < parts[0]!.length; i++) {
    const part = parts[0]![i];
    if (parts.every(p => p[i] === part)) {
      commonParts.push(part!);
    } else {
      break;
    }
  }

  return commonParts.join(path.sep) || path.sep;
}

/**
 * Extract broken references from folder compilation results
 */
function extractBrokenReferencesFromCompileResults(
  results: CompileResult[]
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

  for (const result of results) {
    for (const ref of result.references) {
      if (!ref.found) {
        const targetPath = ref.resolvedPath;

        if (!brokenByTarget.has(targetPath)) {
          brokenByTarget.set(targetPath, {
            targetPath,
            raw: ref.reference.raw,
            error: ref.error || 'File not found',
            sources: [],
          });
        }

        brokenByTarget.get(targetPath)!.sources.push({
          file: result.inputPath,
          line: ref.reference.line,
          column: ref.reference.column,
        });
      }
    }
  }

  return Array.from(brokenByTarget.values());
}

function formatPerFileResults(results: CompileResult[], noColor: boolean): string {
  const c = noColor
    ? { reset: '', green: '', red: '', yellow: '', cyan: '', dim: '' }
    : colors;

  const lines: string[] = [];
  lines.push(`${c.cyan}Per-file compilation results:${c.reset}`);
  lines.push('');

  for (const result of results) {
    const fileName = path.basename(result.inputPath);
    const stats: string[] = [];

    if (result.successCount > 0) {
      stats.push(`${c.green}${result.successCount} resolved${c.reset}`);
    }
    if (result.failedCount > 0) {
      stats.push(`${c.red}${result.failedCount} failed${c.reset}`);
    }

    const statusIcon = result.failedCount > 0 ? `${c.red}✗${c.reset}` : `${c.green}✓${c.reset}`;
    lines.push(`  ${statusIcon} ${fileName} - ${stats.join(', ')}`);
  }

  return lines.join('\n');
}

function formatFolderResult(result: FolderCompileResult, noColor: boolean): string {
  const c = noColor
    ? { reset: '', green: '', red: '', yellow: '', cyan: '', dim: '' }
    : colors;

  const lines: string[] = [];

  lines.push(`${c.cyan}Folder compilation complete${c.reset}\n`);
  lines.push(`  ${c.dim}Input:${c.reset}  ${result.inputDir}`);
  lines.push(`  ${c.dim}Output:${c.reset} ${result.outputDir}\n`);

  const summary: string[] = [];
  summary.push(`${c.green}${result.totalFiles} files compiled${c.reset}`);
  summary.push(`${c.green}${result.totalReferences} references resolved${c.reset}`);

  if (result.totalFailures > 0) {
    summary.push(`${c.red}${result.totalFailures} failures${c.reset}`);
  }

  if (result.circularFiles.length > 0) {
    summary.push(`${c.yellow}${result.circularFiles.length} circular dependencies${c.reset}`);
  }

  lines.push(`  ${summary.join(', ')}`);
  lines.push(`  ${c.dim}Duration:${c.reset} ${result.duration}ms\n`);

  if (result.totalFailures === 0) {
    lines.push(`${c.green}✓${c.reset} All files compiled successfully`);
  }

  return lines.join('\n');
}

async function runSingleFileCompile(file: string, options: CompileCliOptions) {
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }

  try {
    const fileDir = path.dirname(path.resolve(file));
    const workspaceRoot = findWorkspaceRoot(fileDir, options.workspaceRootPath);
    const outputPath = options.output || getBuiltOutputPath(file);
    const result = compileFile(file, {
      outputPath,
      basePath: workspaceRoot,
      optimizeDuplicates: options.optimizeDuplicates,
      headingMode: options.additiveHeadings ? 'additive' : 'normalize',
    });

    // Show broken references grouped by target (if any)
    if (result.failedCount > 0) {
      const brokenRefs = extractBrokenReferencesFromCompileResults([result]);
      if (brokenRefs.length > 0) {
        const brokenOutput = formatBrokenReferencesByTarget(brokenRefs, {
          noColor: options.noColor,
          cwd: process.cwd(),
        });
        if (brokenOutput) {
          console.log(brokenOutput);
          console.log('');
        }
      }
    }

    // Show compile result (tree in verbose mode, summary always)
    console.log(formatCompileResult(result, options.noColor, options.verbose));

    process.exit(result.failedCount > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error compiling ${file}:`, err);
    process.exit(1);
  }
}

async function runFolderCompile(inputPaths: string[], options: CompileCliOptions) {
  // Determine input directory
  let inputDir: string;
  if (inputPaths.length === 1 && fs.existsSync(inputPaths[0]!) && fs.statSync(inputPaths[0]!).isDirectory()) {
    inputDir = inputPaths[0]!;
  } else {
    inputDir = findCommonAncestor(inputPaths);
  }

  const workspaceRoot = findWorkspaceRoot(path.resolve(inputDir), options.workspaceRootPath);
  const outputDir = options.outputDir || path.join(inputDir, 'dist');

  try {
    const result = compileFolder(inputDir, {
      outputDir,
      basePath: workspaceRoot,
      optimizeDuplicates: options.optimizeDuplicates,
      headingMode: options.additiveHeadings ? 'additive' : 'normalize',
    });

    // In verbose mode, show per-file details
    if (options.verbose) {
      console.log(formatPerFileResults(result.results, options.noColor));
      console.log('');
    }

    // Display broken references before success/failure message
    const brokenRefs = extractBrokenReferencesFromCompileResults(result.results);
    if (brokenRefs.length > 0) {
      const brokenOutput = formatBrokenReferencesByTarget(brokenRefs, {
        noColor: options.noColor,
        cwd: process.cwd(),
      });
      if (brokenOutput) {
        console.log(brokenOutput);
      }
    }

    console.log(formatFolderResult(result, options.noColor));

    process.exit(result.totalFailures > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error compiling folder ${inputDir}:`, err);
    process.exit(1);
  }
}

async function runCompile(args: string[]) {
  const options = parseCompileArgs(args);

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (options.files.length === 0) {
    console.error('Error: No files specified for compile');
    console.log(HELP_TEXT);
    process.exit(1);
  }

  const files = expandGlobs(options.files);

  if (files.length === 0) {
    console.error('Error: No matching files found');
    process.exit(1);
  }

  // Detect folder mode
  const isFolderMode =
    files.length > 1 ||
    (files.length === 1 && fs.statSync(files[0]!).isDirectory()) ||
    options.outputDir !== undefined;

  // Validate flag combinations
  if (isFolderMode && options.output) {
    console.error('Error: Cannot use --output with directories or multiple files. Use --output-dir instead.');
    process.exit(1);
  }

  // Branch to appropriate handler
  if (isFolderMode) {
    await runFolderCompile(files, options);
  } else {
    await runSingleFileCompile(files[0]!, options);
  }
}

function parseCheckArgs(args: string[]): CheckCliOptions {
  const options: CheckCliOptions = {
    path: '.',
    noColor: false,
    ignore: [],
    verbose: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--ignore') {
      i++;
      const pattern = args[i];
      if (pattern) {
        options.ignore.push(pattern);
      }
    } else if (arg === '--workspace-root-path') {
      i++;
      const rootPath = args[i];
      if (rootPath) {
        options.workspaceRootPath = rootPath;
      }
    } else if (arg && !arg.startsWith('-')) {
      options.path = arg;
    }

    i++;
  }

  return options;
}

interface BrokenLink {
  file: string;
  reference: string;
  line: number;
  column: number;
  error: string;
}

async function runCheck(args: string[]) {
  const options = parseCheckArgs(args);

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const targetPath = options.path;

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  // Find all markdown files
  let files: string[];
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    files = findMarkdownFiles(targetPath);
  } else if (targetPath.endsWith('.md')) {
    files = [targetPath];
  } else {
    console.error('Error: Path must be a directory or a markdown file');
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No markdown files found');
    process.exit(0);
  }

  const c = options.noColor
    ? { reset: '', green: '', red: '', yellow: '', cyan: '', dim: '', bold: '' }
    : { ...colors, bold: '\x1b[1m' };

  const ignorePatterns = options.ignore.map((p) => new RegExp(p));
  const brokenByFile: Map<string, BrokenLink[]> = new Map();
  let totalFiles = 0;
  let filesWithBroken = 0;
  let totalBroken = 0;
  let totalValid = 0;

  for (const file of files) {
    try {
      const fileDir = path.dirname(path.resolve(file));
      const workspaceRoot = findWorkspaceRoot(fileDir, options.workspaceRootPath);
      const result = validateFile(file, { ignorePatterns, basePath: workspaceRoot });
      totalFiles++;
      totalValid += result.valid.length;

      if (result.invalid.length > 0) {
        filesWithBroken++;
        totalBroken += result.invalid.length;

        const broken: BrokenLink[] = result.invalid.map((ref) => ({
          file,
          reference: ref.raw,
          line: ref.line,
          column: ref.column,
          error: ref.resolution.error || 'File not found',
        }));

        brokenByFile.set(file, broken);
      }
    } catch (err) {
      console.error(`${c.red}Error processing ${file}:${c.reset}`, err);
    }
  }

  // Group broken references by target path
  const brokenByTarget = new Map<
    string,
    {
      targetPath: string;
      raw: string;
      error: string;
      sources: Array<{ file: string; line: number; column: number }>;
    }
  >();

  for (const [sourceFile, brokenLinks] of brokenByFile) {
    for (const link of brokenLinks) {
      const targetPath = link.reference.substring(1); // Remove @ prefix

      if (!brokenByTarget.has(targetPath)) {
        brokenByTarget.set(targetPath, {
          targetPath,
          raw: link.reference,
          error: link.error,
          sources: [],
        });
      }

      brokenByTarget.get(targetPath)!.sources.push({
        file: sourceFile,
        line: link.line,
        column: link.column,
      });
    }
  }

  // Output results
  console.log(`${c.bold}@Reference Check Report${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`Scanned ${c.cyan}${totalFiles}${c.reset} markdown file(s)\n`);

  if (brokenByFile.size === 0) {
    console.log(`${c.green}✓ All references are valid!${c.reset}`);
    console.log(`  ${totalValid} reference(s) checked`);
    process.exit(0);
  }

  // VERBOSE MODE: Show per-file breakdown
  if (options.verbose) {
    console.log(`${c.cyan}${c.bold}Per-File Breakdown:${c.reset}\n`);

    for (const [file, broken] of brokenByFile) {
      const relativeFile = path.relative(process.cwd(), file) || file;
      console.log(`${c.cyan}${relativeFile}${c.reset}`);

      for (const link of broken) {
        console.log(`  ${c.red}✗${c.reset} ${link.reference} ${c.dim}(line ${link.line}, col ${link.column})${c.reset}`);
        console.log(`    ${c.dim}→ ${link.error}${c.reset}`);
      }
      console.log('');
    }
  }

  // DEFAULT MODE: Show broken by target
  const brokenRefsArray = Array.from(brokenByTarget.values());
  const brokenByTargetOutput = formatBrokenReferencesByTarget(brokenRefsArray, {
    noColor: options.noColor,
    cwd: process.cwd(),
  });
  if (brokenByTargetOutput) {
    console.log(brokenByTargetOutput);
  }

  // Summary
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`${c.bold}Summary:${c.reset}`);
  console.log(`  Files with broken refs: ${c.red}${filesWithBroken}${c.reset} / ${totalFiles}`);
  console.log(`  Total broken refs:      ${c.red}${totalBroken}${c.reset}`);
  console.log(`  Total valid refs:       ${c.green}${totalValid}${c.reset}`);

  if (!options.verbose && filesWithBroken > 0) {
    console.log('');
    console.log(`${c.dim}💡 Use --verbose to see per-file breakdown${c.reset}`);
  }

  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  // Check for compile command
  if (args[0] === 'compile') {
    await runCompile(args.slice(1));
    return;
  }

  // Check for check command
  if (args[0] === 'check') {
    await runCheck(args.slice(1));
    return;
  }

  const options = parseArgs(args);

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (options.files.length === 0) {
    console.error('Error: No files specified');
    console.log(HELP_TEXT);
    process.exit(1);
  }

  const files = expandGlobs(options.files);

  if (files.length === 0) {
    console.error('Error: No matching files found');
    process.exit(1);
  }

  // Validate flag combinations
  if (options.quiet && options.summary) {
    console.error('Error: --quiet and --summary are incompatible');
    console.log('Choose one: --quiet (shows errors only) OR --summary (shows compact stats)');
    process.exit(1);
  }
  if (options.quiet && options.verbose) {
    console.error('Error: --quiet and --verbose are incompatible');
    process.exit(1);
  }

  const ignorePatterns = options.ignore.map((p) => new RegExp(p));
  const results: Array<{ file: string; result: ValidationResult }> = [];
  let hasInvalid = false;
  const startTime = Date.now();

  // Validate all files
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      hasInvalid = true;
      continue;
    }

    try {
      const fileDir = path.dirname(path.resolve(file));
      const workspaceRoot = findWorkspaceRoot(fileDir, options.workspaceRootPath);
      const result = validateFile(file, {
        ignorePatterns,
        basePath: workspaceRoot,
        shallow: options.shallow
      });
      results.push({ file, result });

      if (result.invalid.length > 0) {
        hasInvalid = true;
      }

      // Show per-file output ONLY in verbose mode (not in summary or default mode)
      if (options.verbose && !options.summary) {
        if (!options.quiet || result.invalid.length > 0) {
          const output = formatValidationResult(result, {
            noColor: options.noColor,
            errorsOnly: false, // Show all refs in verbose mode
            showFilePath: file,
          });
          if (output.trim()) {
            console.log(output);
            console.log('');
          }
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
      hasInvalid = true;
    }
  }

  const duration = Date.now() - startTime;

  // Output summary based on mode
  if (options.summary) {
    // Summary mode: show compact stats with broken refs
    console.log(formatValidationSummary(results, {
      noColor: options.noColor,
      mode: options.shallow ? 'shallow' : 'recursive',
      duration,
      cwd: process.cwd(),
    }));
  } else {
    // Default and verbose modes: show broken refs + summary
    const cwd = process.cwd();

    // Show broken references grouped by target (if any)
    if (hasInvalid) {
      const brokenByTarget = extractBrokenReferencesByTarget(results, cwd);
      const brokenOutput = formatBrokenReferencesByTarget(brokenByTarget, {
        noColor: options.noColor,
        cwd,
      });
      if (brokenOutput) {
        console.log(brokenOutput);
        console.log('');
      }
    }

    // Show summary stats
    console.log(formatSummary(results, { noColor: options.noColor }));

    // Add mode hint with helpful tips
    if (hasInvalid) {
      console.log('');
      const mode = options.shallow ? 'shallow' : 'recursive';
      const c = options.noColor ? { yellow: '', dim: '', reset: '' } : { yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };
      console.log(`${c.yellow}⚠️  Broken references found (${mode} mode)${c.reset}`);

      if (!options.shallow && results.length > 1) {
        console.log('');
        console.log(`${c.dim}💡 Use --verbose to see per-file breakdown${c.reset}`);
        console.log(`${c.dim}💡 Use --shallow for faster validation of direct refs only${c.reset}`);
      }
    }
  }

  process.exit(hasInvalid ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
