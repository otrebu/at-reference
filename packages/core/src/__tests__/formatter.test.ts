import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatValidationSummary } from '../formatter';
import type { ValidationResult } from '../types';

describe('formatValidationSummary', () => {
  it('formats summary with no errors (recursive)', () => {
    const results = [
      {
        file: 'test1.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 5, valid: 5, invalid: 0 }
        } as ValidationResult
      },
      {
        file: 'test2.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 3, valid: 3, invalid: 0 }
        } as ValidationResult
      }
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'recursive',
      duration: 100
    });

    assert.ok(output.includes('Validation complete (recursive)'));
    assert.ok(output.includes('2 markdown files'));
    assert.ok(output.includes('8 references validated'));
    assert.ok(output.includes('8 valid, 0 invalid'));
    assert.ok(output.includes('Duration: 100ms'));
    assert.ok(output.includes('✓ All references are valid!'));
  });

  it('formats summary with errors (shallow)', () => {
    const results = [
      {
        file: 'test1.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 5, valid: 3, invalid: 2 }
        } as ValidationResult
      }
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'shallow',
      duration: 50
    });

    assert.ok(output.includes('Validation complete (shallow)'));
    assert.ok(output.includes('1 markdown file'));
    assert.ok(output.includes('5 references validated'));
    assert.ok(output.includes('3 valid, 2 invalid'));
    assert.ok(output.includes('⚠️  2 broken references found'));
    assert.ok(output.includes('Use --detailed to see per-file breakdown'));
    assert.ok(output.includes('Shallow mode only checks direct @references'));
  });

  it('formats summary with errors (recursive mode)', () => {
    const results = [
      {
        file: 'test1.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 10, valid: 7, invalid: 3 }
        } as ValidationResult
      }
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'recursive',
      duration: 150
    });

    assert.ok(output.includes('Validation complete (recursive)'));
    assert.ok(output.includes('1 markdown file'));
    assert.ok(output.includes('10 references validated'));
    assert.ok(output.includes('(across dependency trees)'));
    assert.ok(output.includes('7 valid, 3 invalid'));
    assert.ok(output.includes('⚠️  3 broken references found'));
    assert.ok(output.includes('Use --detailed to see per-file breakdown'));
    assert.ok(output.includes('Use --shallow for faster validation of direct refs only'));
  });

  it('handles singular vs plural correctly', () => {
    const singleFile = [
      {
        file: 'single.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 1, valid: 0, invalid: 1 }
        } as ValidationResult
      }
    ];

    const output = formatValidationSummary(singleFile, {
      noColor: true,
      mode: 'recursive'
    });

    assert.ok(output.includes('1 markdown file'));
    assert.ok(output.includes('⚠️  1 broken reference found'));
  });

  it('formats summary without duration when not provided', () => {
    const results = [
      {
        file: 'test.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 5, valid: 5, invalid: 0 }
        } as ValidationResult
      }
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'recursive'
    });

    assert.ok(!output.includes('Duration:'));
    assert.ok(output.includes('✓ All references are valid!'));
  });

  it('aggregates stats across multiple files', () => {
    const results = [
      {
        file: 'file1.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 10, valid: 8, invalid: 2 }
        } as ValidationResult
      },
      {
        file: 'file2.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 15, valid: 12, invalid: 3 }
        } as ValidationResult
      },
      {
        file: 'file3.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 5, valid: 5, invalid: 0 }
        } as ValidationResult
      }
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'recursive',
      duration: 200
    });

    assert.ok(output.includes('3 markdown files'));
    assert.ok(output.includes('30 references validated'));
    assert.ok(output.includes('25 valid, 5 invalid'));
    assert.ok(output.includes('⚠️  5 broken references found'));
    assert.ok(output.includes('Duration: 200ms'));
  });

  it('includes broken references by target when errors exist', () => {
    const results = [
      {
        file: '/path/test1.md',
        result: {
          references: [],
          valid: [],
          invalid: [
            {
              raw: '@docs/missing.md',
              path: 'docs/missing.md',
              startIndex: 0,
              endIndex: 16,
              line: 5,
              column: 1,
              resolution: {
                resolvedPath: '/path/docs/missing.md',
                exists: false,
                isDirectory: false,
                error: 'File not found'
              }
            },
            {
              raw: '@config/broken.md',
              path: 'config/broken.md',
              startIndex: 20,
              endIndex: 37,
              line: 10,
              column: 1,
              resolution: {
                resolvedPath: '/path/config/broken.md',
                exists: false,
                isDirectory: false,
                error: 'File not found'
              }
            },
            {
              raw: '@docs/missing.md',
              path: 'docs/missing.md',
              startIndex: 40,
              endIndex: 56,
              line: 15,
              column: 1,
              resolution: {
                resolvedPath: '/path/docs/missing.md',
                exists: false,
                isDirectory: false,
                error: 'File not found'
              }
            }
          ],
          stats: { total: 10, valid: 7, invalid: 3 },
        } as ValidationResult,
      },
      {
        file: '/path/test2.md',
        result: {
          references: [],
          valid: [],
          invalid: [
            {
              raw: '@docs/missing.md',
              path: 'docs/missing.md',
              startIndex: 0,
              endIndex: 16,
              line: 8,
              column: 1,
              resolution: {
                resolvedPath: '/path/docs/missing.md',
                exists: false,
                isDirectory: false,
                error: 'File not found'
              }
            },
            {
              raw: '@other/gone.md',
              path: 'other/gone.md',
              startIndex: 20,
              endIndex: 34,
              line: 12,
              column: 1,
              resolution: {
                resolvedPath: '/path/other/gone.md',
                exists: false,
                isDirectory: false,
                error: 'File not found'
              }
            }
          ],
          stats: { total: 5, valid: 3, invalid: 2 },
        } as ValidationResult,
      },
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'recursive',
      cwd: '/path',
    });

    // Check for new broken-by-target format
    assert.ok(output.includes('Broken References:'));

    // Should show @docs/missing.md with multiple sources
    assert.ok(output.includes('@docs/missing.md'));
    assert.ok(output.includes('test1.md (line 5, col 1)'));
    assert.ok(output.includes('test1.md (line 15, col 1)'));
    assert.ok(output.includes('test2.md (line 8, col 1)'));

    // Should show other broken references
    assert.ok(output.includes('@config/broken.md'));
    assert.ok(output.includes('@other/gone.md'));
  });

  it('does not include broken references list when no errors', () => {
    const results = [
      {
        file: '/path/test.md',
        result: {
          references: [],
          valid: [],
          invalid: [],
          stats: { total: 5, valid: 5, invalid: 0 },
        } as ValidationResult,
      },
    ];

    const output = formatValidationSummary(results, {
      noColor: true,
      mode: 'recursive',
    });

    assert.ok(!output.includes('Broken References:'));
  });
});
