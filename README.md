# at-reference

Tooling for Claude Code's `@path/to/file` syntax.

## Packages

- **@at-reference/core** - TypeScript library for parsing and validating @ references
- **at-reference-support** - VS Code/Cursor extension for navigation and validation

## Prerequisites

### For CLI Development (@at-reference/core)
- **Node.js** 20 or higher
- **pnpm** 9.0.0 (specified in packageManager)

### For VS Code Extension Development (at-reference-support)
- **Node.js** 20 or higher
- **pnpm** 9.0.0
- **VS Code** 1.85.0 or higher (for development/testing)
- **@vscode/vsce** (included in dev dependencies) for packaging .vsix files

### Build Tools (handled by dependencies)
- **tsup** - bundler for core library
- **esbuild** - bundler for VS Code extension
- **TypeScript** 5.3+

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test
```

## Development

### Core Library

```bash
cd packages/core

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

### VS Code Extension

#### Testing in Development

1. Build both packages:
   ```bash
   pnpm -r build
   ```

2. Open VS Code in the extension directory:
   ```bash
   code packages/vscode
   ```

3. Press `F5` to launch the Extension Development Host
   - This opens a new VS Code window with the extension loaded
   - Open any `.md` file to test the features

4. Or use the watch mode for live reloading:
   ```bash
   cd packages/vscode
   pnpm watch
   ```
   Then press `F5` in VS Code - changes will be picked up on reload (`Ctrl+R` in dev host)

#### Manual Installation

```bash
cd packages/vscode
pnpm build
pnpm package  # Creates .vsix file
```

Then in VS Code: Extensions > ... > Install from VSIX

### Using the CLI

#### Validation

After building:

```bash
# Run from the repo
node packages/core/dist/cli.js CLAUDE.md

# Or link globally
cd packages/core
pnpm link --global
at-ref CLAUDE.md
```

#### Compile

The `compile` command expands @references inline by replacing them with actual file contents wrapped in markdown code blocks. This creates self-contained documentation with all referenced code included.

After building:

```bash
# Compile a single file (creates CLAUDE.built.md)
node packages/core/dist/cli.js compile CLAUDE.md

# With custom output path
node packages/core/dist/cli.js compile CLAUDE.md --output expanded.md

# Compile all markdown files in a directory
node packages/core/dist/cli.js compile docs/

# Or use globally linked command
at-ref compile CLAUDE.md
```

Compiled files include syntax-highlighted code blocks at each @reference location, with HTML comment markers preserving the original reference path.

## Features

### Core Library

```typescript
import { extractReferences, validateFile } from '@at-reference/core';

// Parse references from text
const refs = extractReferences('See @src/index.ts for details');
// refs[0].path === 'src/index.ts'
// refs[0].line === 1
// refs[0].column === 5

// Validate a markdown file
const result = validateFile('./CLAUDE.md');
if (result.invalid.length > 0) {
  console.log('Found invalid references:', result.invalid);
}
```

### VS Code Extension

- **Ctrl/Cmd+Click** on `@path/to/file` to navigate
- **Red squiggles** for invalid references
- **Hover** for file preview
- **Type `@`** for file autocomplete

## Project Structure

```
at-reference/
├── packages/
│   ├── core/           # @at-reference/core
│   │   ├── src/
│   │   │   ├── parser.ts      # extractReferences
│   │   │   ├── resolver.ts    # resolvePath
│   │   │   ├── validator.ts   # validateFile
│   │   │   ├── formatter.ts   # CLI output
│   │   │   └── cli.ts         # at-ref command
│   │   └── package.json
│   └── vscode/         # at-reference-support
│       ├── src/
│       │   ├── extension.ts
│       │   └── providers/
│       │       ├── documentLinkProvider.ts
│       │       ├── diagnosticsProvider.ts
│       │       ├── hoverProvider.ts
│       │       └── completionProvider.ts
│       └── package.json
├── package.json        # Workspace root
└── pnpm-workspace.yaml
```

## License

MIT
