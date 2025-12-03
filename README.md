# at-reference

Tooling for Claude Code's `@path/to/file` syntax.

## Packages

- **@at-reference/core** - TypeScript library for parsing and validating @ references
- **at-reference-support** - VS Code/Cursor extension for navigation and validation

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

After building:

```bash
# Run from the repo
node packages/core/dist/cli.js CLAUDE.md

# Or link globally
cd packages/core
pnpm link --global
at-ref CLAUDE.md
```

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
