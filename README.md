# at-reference

**Tooling for Claude Code's `@path/to/file` reference syntax**

Parse, validate, and compile `@path/to/file` references in markdown. CLI tool and VS Code extension for validation, navigation, and compilation.

## What is @reference syntax?

Claude Code uses `@path/to/file` syntax to reference files in markdown documentation. This project provides tools to:
- **Validate** references (ensure they point to existing files)
- **Navigate** between files (jump to references in your editor)
- **Compile** documentation (expand references inline for self-contained docs)

```markdown
<!-- Example usage -->
See @src/parser.ts for implementation details.
Configuration is in @config/settings.json.
```

## Features

### CLI Tool (`at-ref`)

#### Validation with Multiple Modes
- **Recursive validation (default)** - Validates entire dependency tree
  - When A.md references B.md, and B.md references C.md, validates all 3 files
  - Finds all broken references, including nested dependencies
- **Shallow mode (`--shallow`)** - Fast validation of direct references only
  - ~2x faster, ideal for CI/CD pipelines
  - Only checks references in specified files
- **Check command** - Workspace-wide broken reference audit
  - Scans all markdown files in a directory
  - Groups broken references by target file (shows what's missing and who references it)

#### Compilation with Optimization
- **Single file compilation** - Expand references inline with full file contents
- **Folder compilation** - Compile entire directories with:
  - Dependency-aware ordering (bottom-up, dependencies compiled first)
  - Cross-file caching for massive size reduction with `--optimize-duplicates`
  - Automatic frontmatter stripping in folder mode
- **64% size reduction** - With `--skip-frontmatter --optimize-duplicates`

#### Flexible Output Formats
- **Default** - Per-file details with broken references grouped by target
- **Summary** - Compact stats view for multi-file validation
- **Verbose** - Show all references (valid + broken) per file
- **Quiet** - Only show files with errors (perfect for CI)

### VS Code Extension (`at-reference-support`)

#### Navigation & Feedback
- **Ctrl/Cmd+Click** - Navigate to referenced files instantly
- **Red squiggles** - Real-time validation with error messages
- **Blue decorations** - Visual indicators for valid references
- **Hover preview** - View file contents without opening (configurable line count)

#### Autocomplete
- **Type `@` or `/`** - Get intelligent file path suggestions
- **Respects .gitignore** - Automatically excludes common patterns

#### Context Menu Commands
- **"Compile @References"** - Right-click in editor to compile current file
- **"Compile @References in Folder"** - Right-click folder in explorer to compile all markdown files

#### Configuration Options
5 settings available in VS Code Settings (`atReference.*`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enableDiagnostics` | boolean | `true` | Show error squiggles for invalid references |
| `enableCompletion` | boolean | `true` | Enable autocomplete when typing `@` |
| `enableHover` | boolean | `true` | Show file preview on hover |
| `exclude` | array | `["**/node_modules/**", "**/.git/**"]` | Patterns to exclude from autocomplete |
| `previewLines` | number | `10` | Number of lines to show in hover preview |

## Installation

### CLI Installation

**Option 1: Build from source (recommended for now)**
```bash
git clone https://github.com/yourusername/at-reference.git
cd at-reference
pnpm install && pnpm build

# Link globally
cd packages/core
pnpm link --global

# Now use anywhere
at-ref CLAUDE.md
```

**Option 2: Run directly**
```bash
node packages/core/dist/cli.js CLAUDE.md
```

### VS Code Extension Installation

**Manual installation (until published to marketplace)**
```bash
cd packages/vscode
pnpm build
pnpm package  # Creates .vsix file
```

Then in VS Code: `Extensions → ... → Install from VSIX`

## Usage

### CLI Usage

#### Validation (Default Command)

```bash
# Recursive validation (default) - validates entire dependency tree
at-ref CLAUDE.md

# Fast shallow mode - only direct references
at-ref CLAUDE.md --shallow

# Output modes
at-ref docs/                     # Per-file breakdown
at-ref docs/ --summary           # Compact stats
at-ref docs/ --quiet             # Only files with errors
at-ref docs/ --verbose           # Show all references per file

# Ignore patterns (can use multiple times)
at-ref . --ignore "node_modules" --ignore "vendor"

# Explicit workspace root
at-ref docs/ --workspace-root-path /path/to/root
```

**Validation Flags Reference:**

| Flag | Alias | Description | Use Case |
|------|-------|-------------|----------|
| `--shallow` | - | Non-recursive validation | Fast CI checks (~2x faster) |
| `--summary` | `-s` | Compact stats view | Multi-file validation overview |
| `--verbose` | `-v` | Show all refs per file | Debugging, detailed inspection |
| `--quiet` | `-q` | Only show errors | CI/CD pipelines |
| `--ignore <pattern>` | - | Skip patterns (regex) | Exclude node_modules, vendor, etc. |
| `--workspace-root-path <path>` | - | Set workspace root | Monorepos, custom structures |
| `--no-color` | - | Disable colors | Logs, non-TTY environments |

**Recursive vs Shallow:**
- **Recursive (default)**: Traverses entire dependency tree. Example: If `A.md` references `B.md`, and `B.md` references `C.md`, validating `A.md` checks all 3 files and their nested dependencies. Prevents infinite loops on circular deps. ~200ms for 63 files.
- **Shallow**: Only validates direct references in specified files. Faster but may miss broken references in imported files. ~100ms for 63 files.

#### Check Command

Scan workspace for broken references, grouped by target file:

```bash
# Check all markdown files in current directory
at-ref check

# Check specific directory
at-ref check docs/

# Verbose mode shows per-file breakdown
at-ref check --verbose

# With ignore patterns
at-ref check --ignore "node_modules"
```

**What makes `check` different from default validation?**
- Groups broken references by **target file** (what's missing)
- Shows all **source files** that reference each broken target
- Designed for workspace-wide audits
- Default validation shows results per-file (what's broken in each file)

#### Compilation

**Single File:**
```bash
# Basic compilation (creates CLAUDE.built.md)
at-ref compile CLAUDE.md

# Custom output path
at-ref compile CLAUDE.md --output CLAUDE.compiled.md

# Optimization flags
at-ref compile CLAUDE.md --skip-frontmatter --optimize-duplicates
```

**Folder Compilation:**
```bash
# Compile entire directory (creates dist/ folder)
# Frontmatter automatically skipped in folder mode
at-ref compile docs/

# Custom output directory
at-ref compile docs/ --output-dir build/

# With optimization (massive size reduction for interconnected files)
at-ref compile docs/ --optimize-duplicates

# Verbose mode shows dependency tree
at-ref compile docs/ --verbose
```

**Compilation Flags Reference:**

| Flag | Alias | Description | Impact |
|------|-------|-------------|--------|
| `--skip-frontmatter` | - | Skip refs in YAML frontmatter & strip it | Cleaner output, no frontmatter |
| `--optimize-duplicates` | - | Import each file once, use stubs for duplicates | 64%+ smaller files |
| `--output <path>` | `-o` | Custom output file | Single file mode only |
| `--output-dir <path>` | - | Custom output directory | Folder mode (default: `dist/`) |
| `--dist <path>` | - | Alias for `--output-dir` | Folder mode |
| `--verbose` | - | Show dependency tree | Debugging, understanding deps |
| `--workspace-root-path <path>` | - | Set workspace root | Monorepos |

**How Folder Compilation Works:**
1. **Scans** all `.md` files in directory recursively
2. **Builds dependency graph** from @references (Tarjan's algorithm for cycle detection)
3. **Topologically sorts** files (Kahn's algorithm - dependencies compiled first, bottom-up)
4. **Shares cache** across all files - with `--optimize-duplicates`, shared dependencies included once
5. **Mirrors structure** - `docs/blocks/base.md` → `dist/blocks/base.md`
6. **Auto-strips frontmatter** in folder mode

**Output Format:**
- Full imports: `<file path="src/index.ts">content here</file>`
- Optimized stubs (with `--optimize-duplicates`): `<file path="src/index.ts" />`

### VS Code Extension Usage

#### Basic Features
1. **Navigation**: Ctrl/Cmd+Click on any `@path/to/file` reference to jump to that file
2. **Validation**: Red squiggles appear under broken references with error messages
3. **Visual Feedback**: Blue decorations on valid references
4. **Hover Preview**: Hover over a reference to see file contents (first N lines, configurable)
5. **Autocomplete**: Type `@` to trigger file path suggestions, or `/` to continue path

#### Commands
- **Compile File**: Right-click in markdown editor → "Compile @References"
- **Compile Folder**: Right-click folder in Explorer → "Compile @References in Folder"

#### Configuration
Open VS Code Settings and search for "atReference":

```json
{
  "atReference.enableDiagnostics": true,
  "atReference.enableCompletion": true,
  "atReference.enableHover": true,
  "atReference.exclude": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**"
  ],
  "atReference.previewLines": 15
}
```

## Examples

### Example: Knowledge Base Compilation
Compile interconnected notes into self-contained documents:
```bash
at-ref compile notes/ --optimize-duplicates
```
Result: Each file in `notes/dist/` includes all referenced content, with shared dependencies included only once.

### Example: CI/CD Validation Pipeline
Fast validation for continuous integration:
```bash
# .github/workflows/validate-docs.yml
- name: Validate references
  run: at-ref . --shallow --quiet
```
Result: Exits with code 1 if any broken references found, only prints errors.

### Example: Documentation Audit
Find all broken references across your project:
```bash
at-ref check --verbose
```
Result: Complete report showing which files are missing and which files reference them.

### Example: Self-Contained Documentation Release
Prepare documentation for distribution:
```bash
at-ref compile README.md --skip-frontmatter --optimize-duplicates
```
Result: Single file with all references expanded inline.

## Architecture

### Reference Syntax Rules
- **Pattern**: `@path/to/file` or `@./relative/path`
- **Must contain**: `/` or file extension (to avoid matching emails like `user@domain.com`)
- **Ignored**: References inside code spans (backticks) are not parsed
- **Resolution**: Relative to referencing file's directory, tries `.md` extension and `/index.md`

### Core Library Flow

1. **parser.ts** - Extract `@references` via regex
   - Handles code spans (ignores backtick-wrapped text)
   - Filters out email addresses
   - Returns references with line/column positions

2. **resolver.ts** - Convert paths to absolute
   - Resolves relative paths (`./`, `../`)
   - Tries multiple extensions (`.md`)
   - Handles index files (`path/` → `path/index.md`)

3. **validator.ts** - Check file existence
   - Recursive mode (default): Validates entire dependency tree
   - Shallow mode: Only direct references
   - Tracks visited paths to prevent infinite loops on circular deps

4. **compiler.ts** - Expand references inline
   - Recursive expansion with circular dependency detection
   - Per-file `pathStack` to prevent infinite loops
   - Optional frontmatter skipping and duplicate optimization

5. **dependency-graph.ts** - Build and sort dependency graphs
   - **Tarjan's algorithm** - Detect strongly connected components (cycles)
   - **Kahn's algorithm** - Topological sort (bottom-up ordering)
   - Used for folder compilation

### Key Technical Features

#### Recursive Validation
- **Default behavior** - Validates entire dependency tree
- **Algorithm**: For each valid reference, read imported file and recursively validate its references
- **Visited tracking**: Uses `Set<string>` with `fs.realpathSync()` to handle symlinks
- **Performance**: ~200ms for 63 files with nested dependencies

#### Circular Dependency Detection
Three levels of protection:
1. **Per-file compilation**: `pathStack` during recursive expansion prevents infinite loops
2. **Graph-level folder compilation**: Tarjan's strongly connected components algorithm detects all cycles
3. **Validation**: `Set<string>` of visited paths prevents infinite recursion

#### Cross-File Optimization
- **Single-file mode**: Each `compileFile()` call creates local `importCounts` and `importedFiles` maps
- **Folder mode**: `compileFolder()` creates global maps shared across ALL file compilations
- **Result**: With `--optimize-duplicates`, shared dependencies included once across entire folder (massive size reduction)

### VS Code Extension Architecture

```
extension.ts → Orchestrates 5 providers
├── documentLinkProvider.ts → Ctrl/Cmd+Click navigation
├── diagnosticsProvider.ts → Red squiggles (real-time validation)
├── hoverProvider.ts → File preview on hover
├── completionProvider.ts → Autocomplete @ and /
└── decorationProvider.ts → Visual feedback (blue underlines)
```

Each provider uses the core library (`@at-reference/core`) for parsing, resolution, and validation.

## Development

### Prerequisites
- Node.js 20 or higher
- pnpm 10.25.0

### Project Structure

```
at-reference/ (monorepo)
├── packages/
│   ├── core/              @at-reference/core (CLI + library)
│   │   ├── src/
│   │   │   ├── parser.ts          Extract @references
│   │   │   ├── resolver.ts        Path resolution
│   │   │   ├── validator.ts       File existence checks
│   │   │   ├── compiler.ts        Reference expansion
│   │   │   ├── dependency-graph.ts Graph algorithms
│   │   │   ├── formatter.ts       CLI output (ANSI colors)
│   │   │   ├── tree-formatter.ts  Hierarchical trees
│   │   │   ├── cli.ts             Command dispatcher
│   │   │   ├── types.ts           TypeScript interfaces
│   │   │   └── __tests__/         8 test files
│   │   │       ├── parser.test.ts
│   │   │       ├── resolver.test.ts
│   │   │       ├── validator.test.ts
│   │   │       ├── compiler.test.ts
│   │   │       ├── dependency-graph.test.ts
│   │   │       ├── folder-compile.test.ts
│   │   │       ├── formatter.test.ts
│   │   │       └── formatter-broken-by-target.test.ts
│   │   └── package.json
│   └── vscode/            at-reference-support (extension)
│       ├── src/
│       │   ├── extension.ts       Activation & commands
│       │   ├── config.ts          Settings management
│       │   └── providers/
│       │       ├── documentLinkProvider.ts
│       │       ├── diagnosticsProvider.ts
│       │       ├── hoverProvider.ts
│       │       ├── completionProvider.ts
│       │       └── decorationProvider.ts
│       └── package.json
├── package.json           Workspace root
└── pnpm-workspace.yaml
```

### Development Commands

**Monorepo (from root):**
```bash
pnpm install        # Install all dependencies
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm clean          # Clean build artifacts
pnpm typecheck      # Type check all packages
```

**Core Package** (`packages/core`):
```bash
pnpm build          # tsup → ESM output in dist/
pnpm test           # Node test runner with tsx
pnpm typecheck      # tsc --noEmit
pnpm clean          # Remove dist/

# Run single test file
node --import tsx --test src/__tests__/parser.test.ts
```

**VS Code Extension** (`packages/vscode`):
```bash
pnpm build          # esbuild → extension.js + .vsix package
pnpm watch          # Watch mode for development
pnpm package        # Create .vsix for distribution
pnpm typecheck      # Type checking only

# Development testing:
# 1. Open VS Code in packages/vscode directory
# 2. Press F5 → Extension Development Host window opens
# 3. Open any .md file to test features
# 4. Use pnpm watch for live reloading (Ctrl+R in dev host)
```

### Testing

Uses Node's built-in test runner with tsx (no external test frameworks).

**Test Coverage:**
- `parser.test.ts` - Reference extraction, code spans, email filtering
- `resolver.test.ts` - Path resolution, extensions, index files
- `validator.test.ts` - Recursive/shallow validation, circular deps
- `compiler.test.ts` - Reference expansion, circular detection
- `dependency-graph.test.ts` - Graph building, topological sort, cycles
- `folder-compile.test.ts` - End-to-end folder compilation
- `formatter.test.ts` - CLI output formatting
- `formatter-broken-by-target.test.ts` - Grouped error display

**Run tests:**
```bash
# All tests
pnpm test

# Single test file
cd packages/core
node --import tsx --test src/__tests__/validator.test.ts
```

### Tech Stack
- **TypeScript 5.3+** (strict mode, ES2022 target)
- **Node.js 20+**
- **pnpm 10.25.0** (monorepo with workspace protocol)
- **tsup** (core library bundler)
- **esbuild** (VS Code extension bundler)
- **Node test runner** (native, no frameworks)
- **Zero production dependencies** in core package

## API Reference

Use `@at-reference/core` programmatically in your own projects:

```typescript
import {
  extractReferences,
  validateFile,
  compileFile
} from '@at-reference/core';

// Parse references from text
const refs = extractReferences('See @src/index.ts for details');
// refs[0] = { path: 'src/index.ts', raw: '@src/index.ts', line: 1, column: 5 }

// Validate file (recursive by default)
const result = validateFile('./CLAUDE.md');
if (result.invalid.length > 0) {
  console.log('Found broken references:', result.invalid);
}
// result = { valid: [...], invalid: [...], stats: {...} }

// Validate with shallow mode (fast)
const fastResult = validateFile('./CLAUDE.md', {
  shallow: true,
  basePath: process.cwd()
});

// Compile file
const compiled = compileFile('input.md', {
  outputPath: 'output.md',
  basePath: process.cwd(),
  skipFrontmatter: true,
  optimizeDuplicates: true
});
// compiled = { inputPath, outputPath, references: [...], successCount, failedCount, ... }

// Compile folder
import { compileFolder } from '@at-reference/core';
const folderResult = compileFolder('docs/', {
  outputDir: 'dist/',
  basePath: process.cwd(),
  skipFrontmatter: true,
  optimizeDuplicates: true
});
// folderResult = { totalFiles, totalReferences, totalFailures, circularFiles, duration, ... }
```

## FAQ

### Why are my references not being validated?
References inside code spans (backticks) are intentionally ignored to avoid false positives. Example:
```markdown
This will be validated: @src/index.ts
This will NOT: `@src/index.ts`
```

### What's the difference between `validate` and `check`?
- **`validate <files>`**: Validates specific files, shows per-file details with broken references
- **`check [path]`**: Scans entire workspace, groups broken references by target file (what's missing), shows which source files reference each missing file

### When should I use `--shallow` vs recursive validation?
- **Recursive (default)**: Complete validation of entire dependency tree. Use for thorough checks, finds all broken references including nested ones.
- **Shallow**: Only validates direct references in specified files. Use for CI/CD pipelines, quick checks, or large codebases where you only care about direct references.

### How does circular dependency detection work?
Three levels:
1. **Validation**: Tracks visited paths with `Set<string>` to prevent infinite loops
2. **Per-file compilation**: Uses `pathStack` during recursive expansion
3. **Folder compilation**: Uses Tarjan's strongly connected components algorithm to detect all cycles before compilation

### Can I use this with languages other than markdown?
Currently markdown-only (`.md` files). The core library could be extended to support other formats - would need to update regex in parser.ts to handle different comment syntaxes (e.g., `//` for JS, `#` for Python), but validation/compilation logic is format-agnostic.

### Does it work in monorepos?
Yes! Use `--workspace-root-path <path>` to set an explicit workspace root. The CLI will automatically try to find the workspace root by looking for `.git` directory, but you can override this.

## Contributing

We welcome contributions! Guidelines:
- **Run tests** before submitting PRs: `pnpm test`
- **Follow existing code style**: TypeScript strict mode, clear naming
- **Add tests** for new features in `packages/core/src/__tests__/`
- **Update CLAUDE.md** for significant architectural changes
- **Update README** for user-facing feature changes

## License

MIT
