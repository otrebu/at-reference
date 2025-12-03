#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFile } from './validator';
import { formatValidationResult, formatSummary } from './formatter';
import type { ValidationResult } from './types';

interface CliOptions {
  files: string[];
  noColor: boolean;
  quiet: boolean;
  ignore: string[];
  help: boolean;
}

const HELP_TEXT = `
at-ref - Validate @path/to/file references

Usage:
  at-ref <files...> [options]

Options:
  --no-color     Disable colored output
  --quiet        Only show errors
  --ignore <p>   Ignore pattern (can be used multiple times)
  --help         Show this help message

Examples:
  at-ref CLAUDE.md
  at-ref docs/*.md
  at-ref . --quiet
  at-ref README.md --ignore "node_modules"
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

async function main() {
  const args = process.argv.slice(2);
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
