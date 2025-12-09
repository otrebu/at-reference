# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**at-reference** is a monorepo providing tools for Claude Code's `@path/to/file` reference syntax:
- **@at-reference/core** - Library for parsing, validating, and compiling @ references in markdown
- **at-reference-support** - VS Code extension for navigation, validation, hover, and autocomplete

## Development Commands

### Root (Monorepo)
```bash
pnpm build       # Build all packages
pnpm test        # Run all tests
pnpm clean       # Clean all build artifacts
pnpm typecheck   # Type check all packages
```

### Core Package (packages/core)
```bash
pnpm build       # tsup bundler → ESM output
pnpm test        # Node test runner with tsx
pnpm typecheck   # tsc --noEmit
pnpm clean       # Remove dist/

# Single test file
node --import tsx --test src/__tests__/parser.test.ts
```

### VS Code Extension (packages/vscode)
```bash
pnpm build       # esbuild → extension.js + vsce package
pnpm watch       # Watch mode for development
pnpm package     # Create .vsix for distribution
pnpm typecheck   # Type checking only
```

**Development Testing:** Press F5 in VS Code to launch Extension Development Host with live extension

## Architecture

### Core Library Flow
1. **parser.ts** - Extract @ references via regex (handles code spans, emails)
2. **resolver.ts** - Convert relative paths to absolute (handles ./, ../, index files, extensions)
3. **validator.ts** - Check file existence
4. **compiler.ts** - Expand references inline with `<file path="...">` tags, detect circular deps
5. **dependency-graph.ts** - Build dependency graphs, topological sort (for folder compilation)
6. **cli.ts** - Commands: `validate` (default), `check`, `compile`

**Reference Pattern:** `@path/to/file` or `@./relative/path`
- Must contain `/` or file extension to avoid email conflicts
- Ignored in code spans (backticks)

### Compiler Features

#### Single File Compilation
```bash
# Basic compilation
at-ref compile input.md -o output.md

# Optimization flags (64% size reduction)
at-ref compile input.md -o output.md --skip-frontmatter --optimize-duplicates
```

- `--skip-frontmatter` - Strips YAML frontmatter from output
- `--optimize-duplicates` - Include each file once, use `<file path="..." />` for subsequent refs

#### Folder Compilation

```bash
# Compile entire directory with bottom-up ordering
# Frontmatter automatically skipped in folder mode
at-ref compile docs/ --optimize-duplicates
```

**Key features:**
- **Dependency graph analysis** - Uses Tarjan's algorithm for circular detection, Kahn's algorithm for topological sort
- **Bottom-up compilation** - Dependencies compiled before dependents
- **Cross-file cache** - Shared `importCounts` and `importedFiles` maps across all compilations
- **Structure preservation** - Mirrors source directory hierarchy in `dist/`
- **Auto-skip frontmatter** - YAML frontmatter automatically stripped in folder mode
- **Massive optimization** - With `--optimize-duplicates`, shared deps included once across ALL files

### VS Code Extension Providers
- **documentLinkProvider** - Ctrl/Cmd+Click navigation
- **diagnosticsProvider** - Red squiggles for broken refs
- **hoverProvider** - File preview on hover
- **completionProvider** - Autocomplete @ and /

## Project Structure

```
packages/core/
  src/
    parser.ts          # Regex extraction
    resolver.ts        # Path resolution
    validator.ts       # File validation
    compiler.ts        # Reference expansion (recursive, circular detection, folder compilation)
    dependency-graph.ts # Graph building, topological sort, cycle detection
    formatter.ts       # CLI output (ANSI colors)
    tree-formatter.ts  # Hierarchical import graph
    cli.ts            # Command dispatcher (single file + folder modes)
    types.ts          # TypeScript interfaces
    __tests__/        # Unit tests (parser, resolver, validator, compiler, dependency-graph, folder-compile)

packages/vscode/
  src/
    extension.ts      # Activation & commands
    providers/        # Link, diagnostics, hover, completion
```

## Tech Stack
- **TypeScript 5.3+** (strict mode, ES2022 target)
- **Node.js 20+**
- **pnpm 10.25.0** (monorepo with workspace protocol)
- **tsup** (core bundler)
- **esbuild** (extension bundler)
- **Node test runner** (native, no frameworks)
- **Zero production dependencies** in core package

## Testing
- Tests use Node's built-in test runner with tsx
- All tests in `src/__tests__/*.test.ts`
- Coverage: parser, resolver, validator, compiler
- Run single test: `node --import tsx --test src/__tests__/<name>.test.ts`

## Key Implementation Details

### Circular Dependency Detection
- **Per-file**: Compiler tracks visited files during recursive expansion via `pathStack` to prevent infinite loops
- **Graph-level**: Folder compilation uses Tarjan's strongly connected components algorithm to detect all cycles

### Frontmatter Handling
Optional `--skip-frontmatter` flag strips YAML frontmatter (between `---` delimiters) from compiled output.

### Duplicate Optimization
`--optimize-duplicates` includes each file's content once, subsequent references use self-closing tags `<file path="..." />`.

### Folder Compilation Architecture

**Dependency Graph Building** (`dependency-graph.ts`):
1. Scan all `.md` files in input directory
2. Extract @references from each file
3. Resolve paths to build bidirectional graph (dependencies + dependents)
4. Identify root files (no internal dependencies)

**Topological Sort** (Kahn's algorithm):
1. Calculate in-degree for each node (number of dependencies within file set)
2. Queue nodes with zero in-degree (leaf nodes)
3. Process queue: add to sorted list, reduce dependents' in-degree
4. Detect cycles if unprocessed nodes remain

**Cross-File Cache Sharing**:
- Single-file mode: Each `compileFile()` call creates local `importCounts` and `importedFiles` maps
- Folder mode: `compileFolder()` creates global maps shared across ALL file compilations
- Enables `--optimize-duplicates` to work across entire folder (massive size reduction)

**Bottom-Up Compilation**:
- Files compiled in topological order (dependencies before dependents)
- When compiling file A that references B, B is already in the global cache
- With `--optimize-duplicates`, A uses stub `<file path="..." />` for B

### Path Resolution Strategy
1. Try exact path
2. Try with `.md` extension
3. Try as directory with `/index.md`
4. Resolve relative to referencing file's directory
