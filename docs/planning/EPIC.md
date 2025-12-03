# Epic: At-Reference Tooling

A monorepo containing tooling for Claude Code's `@path/to/file` syntax:
- **@at-reference/core** - Standalone TypeScript library for parsing and validating @ references
- **@at-reference/vscode** - VS Code/Cursor extension for navigation, validation, and autocomplete

```
at-reference/
├── packages/
│   ├── core/                 # npm: @at-reference/core
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── vscode/               # VS Code extension
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── package.json              # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

# Stories

---

## Story: 001-at-reference-resolver

### Narrative
As a developer building tools around Claude Code conventions, I want a TypeScript library to parse and validate `@path/to/file` references so that I can build linters, IDE extensions, and documentation validators without reimplementing the parsing logic.

### Persona
**The tooling author** - Someone building developer tools: VS Code extensions, CLI linters, documentation generators, or MCP servers. They want a well-typed, tested library they can import rather than writing regex themselves. They care about edge cases being handled (emails, decorators) and accurate position reporting.

### Context
Claude Code's `@path/to/file` syntax is becoming a de facto standard in AI-assisted development. There's no standalone library for parsing these references. Every tool reimplements the regex, handles edge cases differently, and bugs propagate. A canonical library would:
- Establish consistent parsing behavior
- Handle edge cases (emails, decorators, various path formats)
- Provide accurate source positions for IDE integration
- Be framework-agnostic (works in Node, browser, Deno)

### Acceptance Criteria
- [ ] Library parses @ references from text with accurate line/column positions
- [ ] Email addresses are not matched as references
- [ ] Decorators without path separators or extensions are not matched
- [ ] Relative paths (`./`, `../`, `/`) are handled correctly
- [ ] Library validates references against filesystem
- [ ] CLI tool validates files from command line
- [ ] Published to npm as `@at-reference/core`
- [ ] Zero runtime dependencies

### Tasks
- [ ] [001-monorepo-scaffold](../tasks/001-monorepo-scaffold.md)
- [ ] [002-parser-core](../tasks/002-parser-core.md)
- [ ] [003-path-resolution](../tasks/003-path-resolution.md)
- [ ] [004-validation-api](../tasks/004-validation-api.md)
- [ ] [005-cli](../tasks/005-cli.md)
- [ ] [006-library-testing](../tasks/006-library-testing.md)
- [ ] [007-library-publishing](../tasks/007-library-publishing.md)

### Notes
- Keep it zero-dependency for maximum portability
- Consider browser compatibility (no `fs` in core parser)
- Position reporting should be configurable (0-indexed vs 1-indexed) for different consumers
- May later add: AST integration, remark plugin, eslint rule

---

## Story: 002-at-reference-navigation

### Narrative
As a developer using Claude Code conventions, I want `@path/to/file` references in my markdown files to be clickable and validated so that I can navigate my codebase faster and catch broken references before they cause confusion.

### Persona
**The Claude Code power user** - Someone who writes CLAUDE.md files, uses @ references in prompts, and maintains documentation with file references. They're already bought into the convention and want IDE support to match. They likely use VS Code or Cursor, work in TypeScript/JavaScript projects, and value keyboard-driven workflows.

### Context
Claude Code popularized the `@path/to/file` syntax for referencing files in prompts and documentation. This convention is spreading but has zero IDE support - references are just plain text. Users manually Cmd+click paths (which doesn't work), or use find-in-files. Broken references go unnoticed until runtime confusion.

The `@at-reference/core` library handles parsing - this extension wraps it in VS Code APIs.

### Acceptance Criteria
- [ ] `@path/to/file` references are underlined and clickable in .md files
- [ ] Ctrl/Cmd+Click navigates to the referenced file
- [ ] Invalid references show red squiggly underline
- [ ] Hovering shows file preview or "file not found" message
- [ ] Typing `@` triggers file path autocomplete
- [ ] Works in VS Code and Cursor

### Tasks
- [ ] [008-extension-scaffold](../tasks/008-extension-scaffold.md)
- [ ] [009-document-links](../tasks/009-document-links.md)
- [ ] [010-diagnostics](../tasks/010-diagnostics.md)
- [ ] [011-hover-provider](../tasks/011-hover-provider.md)
- [ ] [012-completion-provider](../tasks/012-completion-provider.md)
- [ ] [013-configuration](../tasks/013-configuration.md)
- [ ] [014-extension-testing](../tasks/014-extension-testing.md)
- [ ] [015-extension-packaging](../tasks/015-extension-packaging.md)

### Notes
- Depends on `@at-reference/core` being functional (tasks 002-004)
- Cursor uses the same extension API as VS Code - should work out of box
- Could later add "find all references" and "rename file updates references"
- Extension name: `at-reference-support`

---

# Tasks

---

## Task: 001-monorepo-scaffold

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Create the monorepo structure with pnpm workspaces, shared TypeScript config, and package scaffolds for `core` and `vscode`.

### Context
A monorepo allows the extension to depend on the library during development while keeping them separately publishable. pnpm workspaces are lightweight and handle linking well. We need shared TypeScript settings but package-specific builds.

### Plan
1. Initialize root:
   ```bash
   mkdir at-reference && cd at-reference
   pnpm init
   ```
2. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'packages/*'
   ```
3. Create `tsconfig.base.json` with shared compiler options:
   - target: ES2022
   - module: NodeNext
   - strict: true
   - declaration: true
4. Create `packages/core/` structure:
   - `package.json` (name: `@at-reference/core`)
   - `tsconfig.json` extending base
   - `src/index.ts` (empty export)
5. Create `packages/vscode/` structure:
   - `package.json` (name: `at-reference-support`, dependency on `@at-reference/core`)
   - `tsconfig.json` extending base
   - `src/extension.ts` (minimal activation)
6. Add root scripts: `build`, `test`, `clean`
7. Add `.gitignore`, `.npmrc`, `LICENSE`, root `README.md`

### Acceptance Criteria
- [ ] `pnpm install` succeeds and links packages
- [ ] `pnpm -r build` compiles both packages
- [ ] `packages/vscode` can import from `@at-reference/core`
- [ ] Each package has correct `main`, `types`, `exports` fields
- [ ] TypeScript strict mode enabled everywhere

### Test Plan
- [ ] Run `pnpm install` - no errors
- [ ] Run `pnpm -r build` - both compile
- [ ] Add test import in vscode package, verify types resolve

### Scope
- **In:** Repo structure, workspaces, TypeScript config, package scaffolds
- **Out:** Any actual functionality, CI/CD

### Notes
```
at-reference/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── vscode/
│       ├── src/
│       │   └── extension.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .gitignore
```

---

## Task: 002-parser-core

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Implement the core parsing logic that extracts @ references from text with accurate positions.

### Context
This is the heart of the library. The parser must:
- Find all `@path/to/file` patterns
- Ignore false positives (emails, decorators)
- Report accurate line/column for each match
- Be pure (no filesystem, no side effects)

The regex needs careful design to balance precision and recall.

### Plan
1. Create `packages/core/src/types.ts`:
   ```typescript
   export interface AtReference {
     raw: string;        // "@src/index.ts"
     path: string;       // "src/index.ts"
     startIndex: number; // Char offset in source
     endIndex: number;
     line: number;       // 1-indexed
     column: number;     // 1-indexed
   }

   export interface ParseOptions {
     /** Use 0-indexed positions (default: false, 1-indexed) */
     zeroIndexed?: boolean;
   }
   ```
2. Create `packages/core/src/parser.ts`:
   - Define main regex pattern with lookbehind for context
   - Define email pattern for filtering
   - Implement `extractReferences(content: string, options?: ParseOptions): AtReference[]`
3. Implement position calculation:
   - Build line offset map from content
   - Convert char offset to line/column
4. Implement filtering:
   - Skip matches that look like emails
   - Skip matches without `/` or `.ext` (likely decorators)
5. Export from `packages/core/src/index.ts`

### Acceptance Criteria
- [ ] `@path/to/file.ts` is matched
- [ ] `@./relative.ts` and `@../parent.ts` are matched
- [ ] `@/root-relative.ts` is matched
- [ ] `user@example.com` is NOT matched
- [ ] `@Component` (no path/ext) is NOT matched
- [ ] `@file.ts` (has extension) IS matched
- [ ] Line/column positions are accurate
- [ ] Multiple references in one line are all found
- [ ] Works with Windows line endings (CRLF)

### Test Plan
- [ ] Unit: Single reference extraction
- [ ] Unit: Multiple references extraction
- [ ] Unit: Email filtering
- [ ] Unit: Decorator filtering
- [ ] Unit: Position accuracy (line 1, line N, various columns)
- [ ] Unit: CRLF handling
- [ ] Unit: References in brackets `[@file.ts]`
- [ ] Unit: 0-indexed option

### Scope
- **In:** Regex matching, position calculation, filtering
- **Out:** Path resolution, filesystem access, validation

### Notes
Main regex approach:
```typescript
// Match @ preceded by start/whitespace/bracket, followed by path-like string
const AT_PATTERN = /(?<=^|[\s\[\(])@((?:\.{0,2}\/)?[\w\-./]+(?:\.[\w]+)?)/gm;
```

Edge cases to handle:
- `@src/components/Button.tsx` - standard
- `@./local` - relative, no extension (valid - could be directory)
- `@@double` - should match second @ only? Or neither?
- `@path-with-dashes/file_underscores.ts` - special chars in paths

---

## Task: 003-path-resolution

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Implement path resolution logic that converts reference paths to absolute filesystem paths.

### Context
Once we've parsed references, we need to resolve them to actual file paths. This involves:
- Handling relative paths (`./`, `../`)
- Handling root-relative paths (`/`)
- Optionally trying extensions (`.ts`, `.js`)
- Checking existence

This module needs filesystem access, so it's Node-specific (vs the parser which is universal).

### Plan
1. Create `packages/core/src/resolver.ts`:
   ```typescript
   export interface ResolveOptions {
     basePath?: string;           // Default: cwd
     tryExtensions?: string[];    // e.g., ['.ts', '.tsx', '.js']
   }

   export interface ResolvedPath {
     resolvedPath: string;        // Absolute path
     exists: boolean;
     isDirectory: boolean;
     error?: string;
   }
   ```
2. Implement `resolvePath(refPath: string, options?: ResolveOptions): ResolvedPath`:
   - Handle absolute paths (pass through)
   - Handle `./` and `../` (relative to basePath)
   - Handle `/` prefix (relative to basePath root)
   - Handle bare paths (relative to basePath)
3. Implement existence checking:
   - Use `fs.existsSync` and `fs.statSync`
   - Try extensions if file not found and `tryExtensions` provided
4. Export from index with conditional: only in Node environment

### Acceptance Criteria
- [ ] `./file.ts` resolves relative to basePath
- [ ] `../file.ts` resolves to parent directory
- [ ] `/file.ts` resolves from basePath root
- [ ] `file.ts` resolves relative to basePath
- [ ] `exists: true` when file exists
- [ ] `exists: false` with error message when missing
- [ ] `isDirectory: true` for directories
- [ ] `tryExtensions` finds `index` → `index.ts`
- [ ] Handles symlinks correctly

### Test Plan
- [ ] Unit: Relative path resolution
- [ ] Unit: Parent path resolution
- [ ] Unit: Root-relative resolution
- [ ] Unit: Existence checking (create temp files)
- [ ] Unit: Directory detection
- [ ] Unit: Extension trying
- [ ] Unit: Missing file error message

### Scope
- **In:** Path resolution, existence checking, extension trying
- **Out:** Glob patterns, recursive resolution, caching

### Notes
```typescript
export function resolvePath(
  refPath: string,
  options: ResolveOptions = {}
): ResolvedPath {
  const basePath = options.basePath ?? process.cwd();

  let targetPath: string;
  if (path.isAbsolute(refPath)) {
    targetPath = refPath;
  } else if (refPath.startsWith('/')) {
    targetPath = path.resolve(basePath, '.' + refPath);
  } else {
    targetPath = path.resolve(basePath, refPath);
  }

  // Check existence, try extensions, etc.
}
```

---

## Task: 004-validation-api

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Create the high-level validation API that combines parsing and resolution into a simple interface.

### Context
End users shouldn't need to call parser and resolver separately for common use cases. We need convenience functions that:
- Validate a string of content
- Validate a file directly
- Return structured results with valid/invalid groupings
- Provide formatted output for CLI/logs

### Plan
1. Create `packages/core/src/validator.ts`:
   ```typescript
   export interface ValidationResult {
     references: ResolvedReference[];
     valid: ResolvedReference[];
     invalid: ResolvedReference[];
     stats: {
       total: number;
       valid: number;
       invalid: number;
     };
   }

   export interface ValidateOptions extends ResolveOptions {
     ignorePatterns?: RegExp[];
   }
   ```
2. Implement `validateReferences(content: string, options?: ValidateOptions): ValidationResult`:
   - Parse references
   - Resolve each path
   - Filter by ignorePatterns
   - Group into valid/invalid
3. Implement `validateFile(filePath: string, options?: ValidateOptions): ValidationResult`:
   - Read file content
   - Set basePath to file's directory
   - Call validateReferences
4. Create `packages/core/src/formatter.ts`:
   - `formatValidationResult(result, options)` → colored string output
5. Implement `isValidReference(ref: string, basePath?: string): boolean`:
   - Quick single-reference check
6. Update `packages/core/src/index.ts` to export all public APIs

### Acceptance Criteria
- [ ] `validateReferences()` returns grouped results
- [ ] `validateFile()` reads and validates a file
- [ ] `ignorePatterns` filters out matching references
- [ ] `formatValidationResult()` produces readable output
- [ ] `isValidReference()` returns boolean quickly
- [ ] All functions have JSDoc comments
- [ ] Types are exported for consumers

### Test Plan
- [ ] Unit: validateReferences with mixed valid/invalid
- [ ] Unit: validateFile reads from disk
- [ ] Unit: ignorePatterns filtering
- [ ] Unit: formatValidationResult output
- [ ] Unit: isValidReference quick check
- [ ] Integration: End-to-end validation of real CLAUDE.md

### Scope
- **In:** High-level validation API, formatting, convenience functions
- **Out:** Watch mode, caching, parallel validation

### Notes
```typescript
// Example usage
import { validateFile, formatValidationResult } from '@at-reference/core';

const result = validateFile('./CLAUDE.md');
if (result.invalid.length > 0) {
  console.log(formatValidationResult(result));
  process.exit(1);
}
```

---

## Task: 005-cli

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Create a CLI tool for validating @ references from the command line.

### Context
Not everyone wants to write code to validate their files. A CLI enables:
- Quick validation: `at-ref check CLAUDE.md`
- CI integration: Exit code 1 on invalid references
- Glob support: `at-ref check "docs/**/*.md"`
- Pre-commit hooks

### Plan
1. Create `packages/core/src/cli.ts`:
   ```typescript
   #!/usr/bin/env node
   ```
2. Parse arguments (use minimal parsing, no deps):
   - Positional: file paths/globs
   - `--no-color`: Disable colored output
   - `--ignore <pattern>`: Add ignore pattern
   - `--quiet`: Only output errors
   - `--help`: Show usage
3. Implement glob expansion:
   - Use `fs.globSync` (Node 22+) or simple implementation
4. Validate each file:
   - Call `validateFile()`
   - Accumulate results
5. Output results:
   - Use `formatValidationResult()`
   - Print summary at end
6. Exit with code 1 if any invalid references
7. Add bin field to `package.json`:
   ```json
   "bin": {
     "at-ref": "./dist/cli.js"
   }
   ```

### Acceptance Criteria
- [ ] `at-ref CLAUDE.md` validates single file
- [ ] `at-ref docs/*.md` validates multiple files
- [ ] Exit code 0 when all valid
- [ ] Exit code 1 when any invalid
- [ ] `--no-color` disables ANSI colors
- [ ] `--quiet` only shows errors
- [ ] `--help` shows usage
- [ ] Works when installed globally

### Test Plan
- [ ] Unit: Argument parsing
- [ ] Integration: CLI with valid file → exit 0
- [ ] Integration: CLI with invalid file → exit 1
- [ ] Integration: CLI with glob pattern
- [ ] Manual: `npx at-ref --help`

### Scope
- **In:** CLI interface, glob support, exit codes
- **Out:** Watch mode, config file, JSON output

### Notes
```bash
# Usage examples
at-ref CLAUDE.md
at-ref docs/**/*.md --ignore "node_modules"
at-ref . --quiet  # Recursive, errors only

# Pre-commit hook
at-ref $(git diff --cached --name-only --diff-filter=ACM | grep '\.md$')
```

Avoid dependencies - use Node built-ins. `fs.globSync` is available in Node 22+.

---

## Task: 006-library-testing

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Establish comprehensive test suite for the core library.

### Context
The library needs thorough testing because:
- It's a foundation for other tools (extension depends on it)
- Edge cases in parsing are subtle
- Position calculation is error-prone
- Users expect regex-based parsing to "just work"

Use Node's built-in test runner (`node:test`) to avoid dependencies.

### Plan
1. Set up test infrastructure in `packages/core/`:
   - Create `src/__tests__/` directory
   - Add test script: `"test": "node --test --experimental-strip-types src/__tests__/*.test.ts"`
2. Create parser tests (`parser.test.ts`):
   - Basic extraction
   - Multiple references
   - Email filtering
   - Decorator filtering
   - Position accuracy
   - Edge cases (empty string, no refs, only refs)
3. Create resolver tests (`resolver.test.ts`):
   - Path resolution variants
   - Existence checking (use temp directories)
   - Extension trying
4. Create validator tests (`validator.test.ts`):
   - Full validation flow
   - Ignore patterns
   - File validation
5. Create CLI tests (`cli.test.ts`):
   - Argument parsing
   - Exit codes
6. Add test fixtures in `src/__tests__/fixtures/`
7. Add coverage script (c8 or native)

### Acceptance Criteria
- [ ] `pnpm test` runs all tests in core package
- [ ] Parser edge cases covered (>90% branch coverage)
- [ ] Resolver tests use real filesystem (temp dirs)
- [ ] CLI tests verify exit codes
- [ ] Tests run in <5 seconds
- [ ] Tests work in CI (no environment dependencies)

### Test Plan
- [ ] Meta: All tests pass locally
- [ ] Meta: All tests pass in CI
- [ ] Coverage report shows >90% line coverage

### Scope
- **In:** Unit tests, integration tests, fixtures, coverage
- **Out:** Performance benchmarks, fuzz testing

### Notes
```typescript
// Test structure
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractReferences } from '../parser.js';

describe('extractReferences', () => {
  test('extracts basic reference', () => {
    const refs = extractReferences('See @src/index.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].path, 'src/index.ts');
  });
});
```

---

## Task: 007-library-publishing

**Story:** [001-at-reference-resolver](../stories/001-at-reference-resolver.md)

### Goal
Publish `@at-reference/core` to npm with proper metadata and CI/CD.

### Context
Publishing requirements:
- npm organization or scoped package
- Proper package.json metadata
- README with examples
- Changelog
- GitHub Actions for automated releases
- Semantic versioning

### Plan
1. Create npm organization `at-reference` (or use unscoped name)
2. Update `packages/core/package.json`:
   - name, description, keywords
   - repository, bugs, homepage
   - license: MIT
   - files: ["dist"]
   - engines: { node: ">=20" }
3. Create `packages/core/README.md`:
   - Installation
   - Quick start
   - API reference
   - CLI usage
   - Examples
4. Create `packages/core/CHANGELOG.md`
5. Create GitHub Actions workflow (`.github/workflows/release-core.yml`):
   - Trigger on tags `core-v*`
   - Run tests
   - Build
   - Publish to npm
6. Add `prepublishOnly` script to run tests and build
7. Set up npm token as GitHub secret

### Acceptance Criteria
- [ ] `npm publish` succeeds (dry-run first)
- [ ] Package installable: `npm i @at-reference/core`
- [ ] README displays correctly on npm
- [ ] Types available without separate install
- [ ] CLI works when installed globally
- [ ] GitHub release created with changelog

### Test Plan
- [ ] `npm pack` creates valid tarball
- [ ] Install from tarball in fresh project
- [ ] Import and use library
- [ ] Run CLI via npx

### Scope
- **In:** npm publishing, metadata, CI/CD, documentation
- **Out:** Website, API docs generator

### Notes
```json
// package.json additions
{
  "name": "@at-reference/core",
  "version": "1.0.0",
  "description": "Parse and validate @path/to/file references",
  "keywords": ["claude", "claude-code", "markdown", "validator"],
  "repository": {
    "type": "git",
    "url": "https://github.com/username/at-reference.git",
    "directory": "packages/core"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

---

## Task: 008-extension-scaffold

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Set up the VS Code extension package with proper structure and minimal activation.

### Context
The extension lives in `packages/vscode/` and depends on `@at-reference/core`. VS Code extensions need:
- Specific `package.json` structure (contributes, activationEvents)
- Extension manifest fields
- Build that bundles dependencies (esbuild)

### Plan
1. Update `packages/vscode/package.json`:
   ```json
   {
     "name": "at-reference-support",
     "displayName": "At Reference Support",
     "description": "Navigate and validate @path/to/file references",
     "version": "0.1.0",
     "engines": { "vscode": "^1.85.0" },
     "categories": ["Other"],
     "activationEvents": ["onLanguage:markdown"],
     "main": "./dist/extension.js",
     "contributes": {}
   }
   ```
2. Add dependency on `@at-reference/core`:
   ```json
   "dependencies": {
     "@at-reference/core": "workspace:*"
   }
   ```
3. Set up esbuild for bundling:
   - Create `esbuild.js` build script
   - Bundle core library into extension
   - External: `vscode` module
4. Create `src/extension.ts`:
   ```typescript
   import * as vscode from 'vscode';

   export function activate(context: vscode.ExtensionContext) {
     console.log('At Reference Support activated');
   }

   export function deactivate() {}
   ```
5. Add scripts: `build`, `watch`, `package`
6. Create `.vscodeignore` for lean packaging
7. Test activation in Extension Development Host

### Acceptance Criteria
- [ ] `pnpm build` in vscode package succeeds
- [ ] Extension activates when opening .md file
- [ ] Core library bundled into extension (no external deps)
- [ ] F5 launches Extension Development Host
- [ ] "At Reference Support" appears in Extensions list

### Test Plan
- [ ] Run `pnpm build` - compiles without error
- [ ] Run Extension Development Host - extension activates
- [ ] Check Output panel for activation log

### Scope
- **In:** Extension scaffold, bundling, activation
- **Out:** Any features (links, diagnostics, etc.)

### Notes
```javascript
// esbuild.js
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
});
```

---

## Task: 009-document-links

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Implement `DocumentLinkProvider` so @ references become clickable links.

### Context
This is the core feature. VS Code's `DocumentLinkProvider` API creates clickable regions that navigate to target files. We use `@at-reference/core` for parsing and add VS Code-specific link creation.

### Plan
1. Create `packages/vscode/src/providers/documentLinkProvider.ts`
2. Import parser from `@at-reference/core`
3. Implement `DocumentLinkProvider`:
   ```typescript
   class AtReferenceLinkProvider implements vscode.DocumentLinkProvider {
     provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
       const refs = extractReferences(document.getText(), { zeroIndexed: true });
       return refs.map(ref => this.createLink(ref, document));
     }

     private createLink(ref: AtReference, document: vscode.TextDocument): vscode.DocumentLink {
       const range = new vscode.Range(
         ref.line, ref.column,
         ref.line, ref.column + ref.raw.length
       );
       const targetUri = this.resolveUri(ref.path, document.uri);
       return new vscode.DocumentLink(range, targetUri);
     }
   }
   ```
4. Implement `resolveUri`:
   - Get workspace folder
   - Resolve relative to document or workspace
5. Register in `extension.ts`:
   ```typescript
   context.subscriptions.push(
     vscode.languages.registerDocumentLinkProvider(
       { language: 'markdown' },
       new AtReferenceLinkProvider()
     )
   );
   ```

### Acceptance Criteria
- [ ] @ references are underlined in markdown
- [ ] Ctrl/Cmd+Click opens referenced file
- [ ] Relative paths resolve from document location
- [ ] Missing files don't crash (link just doesn't navigate)
- [ ] Works with workspace folders

### Test Plan
- [ ] Integration: Provider returns links for references
- [ ] Manual: Click `@package.json` → opens file
- [ ] Manual: Click `@src/index.ts` → opens file
- [ ] Manual: Click missing file → nothing happens (no crash)

### Scope
- **In:** Link creation, path resolution, click navigation
- **Out:** Validation (red squiggles), hover, autocomplete

### Notes
Need to handle 0-indexed positions. VS Code uses 0-indexed, add option to core parser or convert here.

---

## Task: 010-diagnostics

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Show red squiggly underlines for @ references pointing to non-existent files.

### Context
VS Code's `DiagnosticCollection` reports problems at specific locations. Invalid references should surface immediately so users fix them before committing. Uses `@at-reference/core` validation under the hood.

### Plan
1. Create `packages/vscode/src/providers/diagnosticsProvider.ts`
2. Create `DiagnosticCollection`:
   ```typescript
   const diagnostics = vscode.languages.createDiagnosticCollection('at-references');
   ```
3. Implement `validateDocument(document: vscode.TextDocument)`:
   - Use `validateReferences` from core
   - Create `Diagnostic` for each invalid reference
   - Set severity to Error
   - Set to diagnostics collection
4. Register listeners:
   - `vscode.workspace.onDidOpenTextDocument`
   - `vscode.workspace.onDidSaveTextDocument`
   - `vscode.workspace.onDidChangeTextDocument` (debounced 500ms)
5. Clear diagnostics on document close
6. Add to extension activation

### Acceptance Criteria
- [ ] Missing file references show red underline
- [ ] Diagnostic message shows resolved path
- [ ] Problems panel lists all invalid references
- [ ] Diagnostics update on save
- [ ] Diagnostics update on edit (debounced)
- [ ] Diagnostics clear when file closes

### Test Plan
- [ ] Integration: Invalid ref produces diagnostic
- [ ] Integration: Valid ref produces no diagnostic
- [ ] Manual: Type `@missing.ts` → red squiggle appears
- [ ] Manual: Create the file → squiggle disappears on save

### Scope
- **In:** Diagnostic creation, update triggers, debouncing
- **Out:** Quick fixes, code actions

### Notes
```typescript
// Debouncing
let timeout: NodeJS.Timeout | undefined;
vscode.workspace.onDidChangeTextDocument((e) => {
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => validateDocument(e.document), 500);
});
```

---

## Task: 011-hover-provider

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Show file preview or error message when hovering over @ references.

### Context
`HoverProvider` shows rich content on hover. For valid files, show a preview of first N lines. For invalid files, show "File not found" with the resolved path.

### Plan
1. Create `packages/vscode/src/providers/hoverProvider.ts`
2. Implement `HoverProvider`:
   ```typescript
   class AtReferenceHoverProvider implements vscode.HoverProvider {
     provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
       const ref = this.getReferenceAtPosition(document, position);
       if (!ref) return null;

       const resolved = resolvePath(ref.path, ...);
       if (resolved.exists) {
         return this.createPreviewHover(resolved.resolvedPath);
       } else {
         return this.createErrorHover(resolved);
       }
     }
   }
   ```
3. Implement `getReferenceAtPosition`:
   - Parse document
   - Find reference containing position
4. Implement `createPreviewHover`:
   - Read first 10 lines of file
   - Detect language from extension
   - Format as markdown code block
5. Implement `createErrorHover`:
   - Show "File not found" message
   - Show resolved path
6. Register in extension

### Acceptance Criteria
- [ ] Hover over valid reference shows file preview
- [ ] Preview has syntax highlighting based on extension
- [ ] Hover over invalid reference shows error
- [ ] Error shows resolved path
- [ ] Hover outside references shows nothing

### Test Plan
- [ ] Integration: Hover at reference returns content
- [ ] Integration: Hover at non-reference returns null
- [ ] Manual: Hover over `@package.json` → see JSON preview
- [ ] Manual: Hover over missing file → see error

### Scope
- **In:** Hover detection, preview generation, error display
- **Out:** Full file content, custom preview length setting (yet)

### Notes
```typescript
const hover = new vscode.MarkdownString();
hover.appendCodeblock(preview, languageId);
hover.appendMarkdown(`\n\n*${resolvedPath}*`);
return new vscode.Hover(hover);
```

---

## Task: 012-completion-provider

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Trigger file path autocomplete when user types `@`.

### Context
`CompletionItemProvider` suggests completions as the user types. Show workspace files when typing `@`, filtered as the user continues typing the path.

### Plan
1. Create `packages/vscode/src/providers/completionProvider.ts`
2. Implement `CompletionItemProvider`:
   ```typescript
   class AtReferenceCompletionProvider implements vscode.CompletionItemProvider {
     provideCompletionItems(
       document: vscode.TextDocument,
       position: vscode.Position
     ): vscode.CompletionItem[] {
       if (!this.shouldTrigger(document, position)) return [];

       const partial = this.getPartialPath(document, position);
       const files = this.findMatchingFiles(partial);
       return files.map(f => this.createCompletionItem(f));
     }
   }
   ```
3. Configure trigger characters: `['@', '/']`
4. Implement file finding:
   - Use `vscode.workspace.findFiles`
   - Exclude node_modules, .git
   - Limit to 50 results
5. Create completion items:
   - Set insertText (path without @)
   - Set filterText for fuzzy matching
   - Set file icon based on extension
   - Set detail (relative path)
6. Register with trigger characters

### Acceptance Criteria
- [ ] Typing `@` shows file suggestions
- [ ] Typing `@src/` filters to src directory
- [ ] Selecting completion inserts path
- [ ] node_modules excluded
- [ ] .git excluded
- [ ] File icons shown
- [ ] Fuzzy matching works

### Test Plan
- [ ] Integration: Completion at `@` returns items
- [ ] Integration: Completion filters by partial path
- [ ] Manual: Type `@`, see files
- [ ] Manual: Type `@pack`, see `package.json`

### Scope
- **In:** File completion, filtering, icons
- **Out:** Directory-only completion, recursive directory expansion

### Notes
```typescript
const files = await vscode.workspace.findFiles(
  '**/*',
  '{**/node_modules/**,**/.git/**}',
  50 // limit
);
```

---

## Task: 013-configuration

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Add user-configurable settings for the extension.

### Context
Users need to customize: file patterns, excluded directories, feature toggles. VS Code's configuration API handles this with schema-based settings.

### Plan
1. Define configuration in `packages/vscode/package.json`:
   ```json
   "contributes": {
     "configuration": {
       "title": "At Reference Support",
       "properties": {
         "atReference.filePatterns": {
           "type": "array",
           "default": ["**/*.md"],
           "description": "Glob patterns for files to activate features"
         },
         "atReference.exclude": {
           "type": "array",
           "default": ["**/node_modules/**", "**/.git/**"],
           "description": "Patterns to exclude from completion"
         },
         "atReference.enableDiagnostics": {
           "type": "boolean",
           "default": true
         },
         "atReference.enableCompletion": {
           "type": "boolean",
           "default": true
         },
         "atReference.enableHover": {
           "type": "boolean",
           "default": true
         },
         "atReference.previewLines": {
           "type": "number",
           "default": 10
         }
       }
     }
   }
   ```
2. Create `packages/vscode/src/config.ts`:
   - Helper to read configuration
   - Type-safe access
3. Update providers to respect configuration
4. Listen for configuration changes:
   ```typescript
   vscode.workspace.onDidChangeConfiguration(e => {
     if (e.affectsConfiguration('atReference')) {
       // Re-initialize providers
     }
   });
   ```

### Acceptance Criteria
- [ ] Settings appear in VS Code Settings UI
- [ ] `filePatterns` changes which files activate features
- [ ] `exclude` filters completion results
- [ ] Feature toggles enable/disable providers
- [ ] Changes apply without restart

### Test Plan
- [ ] Manual: Disable diagnostics, verify no squiggles
- [ ] Manual: Add `.txt` to patterns, verify features work
- [ ] Manual: Add exclude pattern, verify filtered

### Scope
- **In:** Settings schema, reading config, applying changes
- **Out:** Workspace-specific settings (use VS Code's built-in scoping)

### Notes
```typescript
// config.ts
export function getConfig() {
  const config = vscode.workspace.getConfiguration('atReference');
  return {
    filePatterns: config.get<string[]>('filePatterns', ['**/*.md']),
    exclude: config.get<string[]>('exclude', []),
    enableDiagnostics: config.get<boolean>('enableDiagnostics', true),
    // ...
  };
}
```

---

## Task: 014-extension-testing

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Establish test suite for the VS Code extension.

### Context
VS Code extensions have unique testing needs:
- Integration tests run in VS Code environment (`@vscode/test-electron`)
- Tests need workspace fixtures
- API mocking is complex

### Plan
1. Set up testing infrastructure:
   - Install `@vscode/test-electron`, `mocha`, `@types/mocha`
   - Create `src/test/runTest.ts` (launcher)
   - Create `src/test/suite/index.ts` (test runner)
2. Create test fixtures in `src/test/fixtures/`:
   - Sample markdown files with references
   - Sample project structure
3. Write integration tests:
   - `documentLink.test.ts` - links returned correctly
   - `diagnostics.test.ts` - invalid refs produce diagnostics
   - `hover.test.ts` - hover content correct
   - `completion.test.ts` - completion items returned
4. Add test script to package.json
5. Configure for CI (headless)

### Acceptance Criteria
- [ ] `pnpm test` runs extension tests
- [ ] Tests run in VS Code environment
- [ ] Each provider has test coverage
- [ ] Tests pass in CI (headless)
- [ ] Fixtures cover edge cases

### Test Plan
- [ ] Meta: All tests pass locally
- [ ] Meta: All tests pass in CI

### Scope
- **In:** Integration tests, fixtures, CI setup
- **Out:** E2E tests, visual tests

### Notes
```typescript
// src/test/suite/documentLink.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('DocumentLinkProvider', () => {
  test('returns links for @ references', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'See @package.json',
      language: 'markdown'
    });
    // Get links via command or provider directly
  });
});
```

---

## Task: 015-extension-packaging

**Story:** [002-at-reference-navigation](../stories/002-at-reference-navigation.md)

### Goal
Package and publish extension to VS Code Marketplace and Open VSX.

### Context
Publishing to both marketplaces ensures the extension works in VS Code and Cursor (which uses Open VSX). Needs:
- Proper metadata and branding
- CI/CD for releases
- Publisher accounts

### Plan
1. Create publisher accounts:
   - VS Code Marketplace (Azure DevOps)
   - Open VSX
2. Add extension metadata to `package.json`:
   - publisher
   - icon (create 128x128 PNG)
   - repository, bugs
   - categories, keywords
3. Create `packages/vscode/README.md`:
   - Features with screenshots
   - Installation
   - Configuration
   - Changelog link
4. Create `packages/vscode/CHANGELOG.md`
5. Create GitHub Actions workflow:
   ```yaml
   # .github/workflows/release-vscode.yml
   on:
     push:
       tags: ['vscode-v*']
   jobs:
     publish:
       steps:
         - uses: actions/checkout@v4
         - run: pnpm install
         - run: pnpm --filter @at-reference/core build
         - run: pnpm --filter at-reference-support build
         - run: pnpm --filter at-reference-support package
         - run: npx vsce publish
         - run: npx ovsx publish
   ```
6. Add secrets for `VSCE_PAT` and `OVSX_PAT`

### Acceptance Criteria
- [ ] `pnpm package` creates .vsix file
- [ ] Extension installable from .vsix
- [ ] Published to VS Code Marketplace
- [ ] Published to Open VSX
- [ ] Works in Cursor
- [ ] README displays with screenshots
- [ ] Icon shows in extension list

### Test Plan
- [ ] Install .vsix in fresh VS Code
- [ ] Install from Marketplace
- [ ] Install in Cursor from Open VSX

### Scope
- **In:** Packaging, publishing, CI/CD, branding
- **Out:** Paid features, telemetry, website

### Notes
```bash
# Manual publish commands
npx vsce package  # Creates .vsix
npx vsce publish  # Publishes to Marketplace
npx ovsx publish <file>.vsix  # Publishes to Open VSX
```

---

# Summary

## Task Dependencies

```
001-monorepo-scaffold
    ├── 002-parser-core
    │   ├── 003-path-resolution
    │   │   └── 004-validation-api
    │   │       └── 005-cli
    │   └── 006-library-testing
    └── 008-extension-scaffold
        ├── 009-document-links ←── (needs 002)
        ├── 010-diagnostics ←──── (needs 002, 003)
        ├── 011-hover-provider ←─ (needs 002, 003)
        └── 012-completion-provider
            └── 013-configuration
                └── 014-extension-testing
                    └── 015-extension-packaging

007-library-publishing (after 001-006)
```

## Effort Estimates

| Task | Effort | Dependencies |
|------|--------|--------------|
| 001-monorepo-scaffold | S | None |
| 002-parser-core | M | 001 |
| 003-path-resolution | S | 001 |
| 004-validation-api | S | 002, 003 |
| 005-cli | S | 004 |
| 006-library-testing | M | 002, 003, 004 |
| 007-library-publishing | S | 006 |
| 008-extension-scaffold | S | 001 |
| 009-document-links | M | 008, 002 |
| 010-diagnostics | M | 008, 002, 003 |
| 011-hover-provider | S | 008, 002, 003 |
| 012-completion-provider | M | 008 |
| 013-configuration | S | 009-012 |
| 014-extension-testing | M | 009-013 |
| 015-extension-packaging | S | 014 |

## Milestones

**Milestone 1: Library MVP** (Tasks 001-004)
- Parser and validator working
- Can validate CLAUDE.md files programmatically

**Milestone 2: Library Complete** (Tasks 005-007)
- CLI available
- Published to npm

**Milestone 3: Extension MVP** (Tasks 008-009)
- Clickable @ references in VS Code

**Milestone 4: Extension Complete** (Tasks 010-015)
- Full feature set
- Published to marketplaces
