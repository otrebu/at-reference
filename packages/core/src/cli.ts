#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFile } from './validator';
import { formatValidationResult, formatSummary } from './formatter';
import { compileFile, getBuiltOutputPath } from './compiler';
import type { ValidationResult } from './types';
import type { CompileResult } from './compiler';

interface CliOptions {
  files: string[];
  noColor: boolean;
  quiet: boolean;
  ignore: string[];
  help: boolean;
}

interface CompileCliOptions {
  files: string[];
  output?: string;
  noColor: boolean;
  help: boolean;
}

const HELP_TEXT = `
at-ref - Validate @path/to/file references

Usage:
  at-ref <files...> [options]
  at-ref compile <files...> [options]

Commands:
  (default)      Validate @ references in files
  compile        Compile files by expanding @ references

Validation Options:
  --no-color     Disable colored output
  --quiet        Only show errors
  --ignore <p>   Ignore pattern (can be used multiple times)
  --help         Show this help message

Compile Options:
  --output <p>   Output path (for single file only)
  --no-color     Disable colored output
  --help         Show this help message

Examples:
  at-ref CLAUDE.md
  at-ref docs/*.md
  at-ref . --quiet
  at-ref README.md --ignore "node_modules"

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
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--output' || arg === '-o') {
      i++;
      const outputPath = args[i];
      if (outputPath) {
        options.output = outputPath;
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

  lines.push(`${c.cyan}Compiling:${c.reset} ${result.inputPath}`);
  lines.push(`${c.cyan}Output:${c.reset} ${result.outputPath}`);
  lines.push('');

  for (const ref of result.references) {
    if (ref.found) {
      lines.push(`  ${c.green}✓${c.reset} ${ref.reference.raw} → ${c.dim}${ref.resolvedPath}${c.reset}`);
    } else {
      lines.push(`  ${c.red}✗${c.reset} ${ref.reference.raw} → ${c.red}${ref.error}${c.reset}`);
    }
  }

  lines.push('');
  const summary = `${c.green}${result.successCount} resolved${c.reset}, ${c.red}${result.failedCount} failed${c.reset}`;
  lines.push(`Summary: ${summary}`);

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
      const outputPath = options.output || getBuiltOutputPath(file);
      const result = compileFile(file, { outputPath });
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

async function main() {
  const args = process.argv.slice(2);

  // Check for compile command
  if (args[0] === 'compile') {
    await runCompile(args.slice(1));
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
      const result = validateFile(file, { ignorePatterns });
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
