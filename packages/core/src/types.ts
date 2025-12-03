/**
 * A parsed @ reference from text
 */
export interface AtReference {
  /** The full matched string including @ (e.g., "@src/index.ts") */
  raw: string;
  /** The path portion without @ (e.g., "src/index.ts") */
  path: string;
  /** Character offset from start of source */
  startIndex: number;
  /** Character offset of end of match */
  endIndex: number;
  /** Line number (1-indexed by default) */
  line: number;
  /** Column number (1-indexed by default) */
  column: number;
}

/**
 * Options for parsing @ references
 */
export interface ParseOptions {
  /** Use 0-indexed positions (default: false, 1-indexed) */
  zeroIndexed?: boolean;
}

/**
 * Options for resolving paths
 */
export interface ResolveOptions {
  /** Base path for resolving relative references (default: cwd) */
  basePath?: string;
  /** Extensions to try when file not found (e.g., ['.ts', '.tsx', '.js']) */
  tryExtensions?: string[];
}

/**
 * Result of resolving a reference path
 */
export interface ResolvedPath {
  /** The absolute resolved path */
  resolvedPath: string;
  /** Whether the file/directory exists */
  exists: boolean;
  /** Whether the path is a directory */
  isDirectory: boolean;
  /** Error message if resolution failed */
  error?: string;
}

/**
 * A reference with resolution information
 */
export interface ResolvedReference extends AtReference {
  /** Resolution result */
  resolution: ResolvedPath;
}

/**
 * Options for validation
 */
export interface ValidateOptions extends ResolveOptions {
  /** Patterns to ignore (references matching these won't be validated) */
  ignorePatterns?: RegExp[];
}

/**
 * Result of validating references in content
 */
export interface ValidationResult {
  /** All references found */
  references: ResolvedReference[];
  /** References that resolved to existing files */
  valid: ResolvedReference[];
  /** References that did not resolve */
  invalid: ResolvedReference[];
  /** Summary statistics */
  stats: {
    total: number;
    valid: number;
    invalid: number;
  };
}

/**
 * Options for formatting validation results
 */
export interface FormatOptions {
  /** Disable ANSI color codes */
  noColor?: boolean;
  /** Only show invalid references */
  errorsOnly?: boolean;
  /** Show file path being validated */
  showFilePath?: string;
}
