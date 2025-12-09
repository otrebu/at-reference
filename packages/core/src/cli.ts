#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFile } from './validator';
import { formatValidationResult, formatSummary } from './formatter';
import { compileFile, getBuiltOutputPath } from './compiler';
import type { ValidationResult } from './types';
import type { CompileResult } from './compiler';
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
  help: boolean;
}

interface CompileCliOptions {
  files: string[];
  output?: string;
  noColor: boolean;
  workspaceRootPath?: string;
  skipFrontmatter: boolean;
  optimizeDuplicates: boolean;
  help: boolean;
}

interface CheckCliOptions {
  path: string;
  noColor: boolean;
  ignore: string[];
  workspaceRootPath?: string;
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
  --no-color              Disable colored output
  --quiet                 Only show errors
  --ignore <p>            Ignore pattern (can be used multiple times)
  --workspace-root-path   Explicit workspace root path
  --help                  Show this help message

Check Options:
  --no-color              Disable colored output
  --ignore <p>            Ignore pattern (can be used multiple times)
  --workspace-root-path   Explicit workspace root path
  --help                  Show this help message

Compile Options:
  --output <p>            Output path (for single file only)
  --skip-frontmatter      Skip @refs in front matter & strip it from output
  --optimize-duplicates   Only import each file once, use references for duplicates
  --no-color              Disable colored output
  --workspace-root-path   Explicit workspace root path
  --help                  Show this help message

Examples:
  at-ref CLAUDE.md
  at-ref docs/*.md
  at-ref . --quiet
  at-ref README.md --ignore "node_modules"

  at-ref check
  at-ref check docs/
  at-ref check --ignore "vendor"

  at-ref compile CLAUDE.md
  at-ref compile CLAUDE.md --output CLAUDE.compiled.md
  at-ref compile docs/
`;

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    files: [],
    noColor: false,
    quiet: false,
    ignore: [],
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
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
    skipFrontmatter: false,
    optimizeDuplicates: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--skip-frontmatter') {
      options.skipFrontmatter = true;
    } else if (arg === '--optimize-duplicates') {
      options.optimizeDuplicates = true;
    } else if (arg === '--output' || arg === '-o') {
      i++;
      const outputPath = args[i];
      if (outputPath) {
        options.output = outputPath;
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

function formatCompileResult(result: CompileResult, noColor: boolean): string {
  const c = noColor
    ? { reset: '', green: '', red: '', yellow: '', cyan: '', dim: '' }
    : colors;

  const lines: string[] = [];

  // Header
  lines.push(`${c.cyan}# ${path.basename(result.inputPath)}${c.reset}`);
  lines.push('');

  // Tree output if there are references
  if (result.references.length > 0) {
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

  // If output is specified, only allow single file
  if (options.output && files.length > 1) {
    console.error('Error: --output can only be used with a single file');
    process.exit(1);
  }

  let hasFailures = false;
  const results: CompileResult[] = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      hasFailures = true;
      continue;
    }

    try {
      const fileDir = path.dirname(path.resolve(file));
      const workspaceRoot = findWorkspaceRoot(fileDir, options.workspaceRootPath);
      const outputPath = options.output || getBuiltOutputPath(file);
      const result = compileFile(file, {
        outputPath,
        basePath: workspaceRoot,
        skipFrontmatter: options.skipFrontmatter,
        optimizeDuplicates: options.optimizeDuplicates
      });
      results.push(result);

      console.log(formatCompileResult(result, options.noColor));
      console.log('');

      if (result.failedCount > 0) {
        hasFailures = true;
      }
    } catch (err) {
      console.error(`Error compiling ${file}:`, err);
      hasFailures = true;
    }
  }

  // Summary for multiple files
  if (results.length > 1) {
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failedCount, 0);
    const c = options.noColor
      ? { reset: '', green: '', red: '', cyan: '' }
      : colors;
    console.log(`${c.cyan}Total:${c.reset} ${results.length} files compiled, ${c.green}${totalSuccess} references resolved${c.reset}, ${c.red}${totalFailed} failed${c.reset}`);
  }

  process.exit(hasFailures ? 1 : 0);
}

function parseCheckArgs(args: string[]): CheckCliOptions {
  const options: CheckCliOptions = {
    path: '.',
    noColor: false,
    ignore: [],
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
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

  // Output results
  console.log(`${c.bold}@Reference Check Report${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`Scanned ${c.cyan}${totalFiles}${c.reset} markdown file(s)\n`);

  if (brokenByFile.size === 0) {
    console.log(`${c.green}✓ All references are valid!${c.reset}`);
    console.log(`  ${totalValid} reference(s) checked`);
    process.exit(0);
  }

  // List broken links by file
  console.log(`${c.red}${c.bold}Broken References:${c.reset}\n`);

  for (const [file, broken] of brokenByFile) {
    const relativeFile = path.relative(process.cwd(), file) || file;
    console.log(`${c.cyan}${relativeFile}${c.reset}`);

    for (const link of broken) {
      console.log(`  ${c.red}✗${c.reset} ${link.reference} ${c.dim}(line ${link.line}, col ${link.column})${c.reset}`);
      console.log(`    ${c.dim}→ ${link.error}${c.reset}`);
    }
    console.log('');
  }

  // Summary
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`${c.bold}Summary:${c.reset}`);
  console.log(`  Files with broken refs: ${c.red}${filesWithBroken}${c.reset} / ${totalFiles}`);
  console.log(`  Total broken refs:      ${c.red}${totalBroken}${c.reset}`);
  console.log(`  Total valid refs:       ${c.green}${totalValid}${c.reset}`);

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

  const ignorePatterns = options.ignore.map((p) => new RegExp(p));
  const results: Array<{ file: string; result: ValidationResult }> = [];
  let hasInvalid = false;

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      hasInvalid = true;
      continue;
    }

    try {
      const fileDir = path.dirname(path.resolve(file));
      const workspaceRoot = findWorkspaceRoot(fileDir, options.workspaceRootPath);
      const result = validateFile(file, { ignorePatterns, basePath: workspaceRoot });
      results.push({ file, result });

      if (result.invalid.length > 0) {
        hasInvalid = true;
      }

      if (!options.quiet || result.invalid.length > 0) {
        const output = formatValidationResult(result, {
          noColor: options.noColor,
          errorsOnly: options.quiet,
          showFilePath: file,
        });
        if (output.trim()) {
          console.log(output);
          console.log('');
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
      hasInvalid = true;
    }
  }

  if (results.length > 1) {
    console.log(formatSummary(results, { noColor: options.noColor }));
  }

  process.exit(hasInvalid ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
