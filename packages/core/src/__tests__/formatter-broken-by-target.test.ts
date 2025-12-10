import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { formatBrokenReferencesByTarget } from '../formatter';
import type { BrokenReferenceByTarget } from '../types';

describe('formatBrokenReferencesByTarget', () => {
  it('formats empty list', () => {
    const result = formatBrokenReferencesByTarget([], { noColor: true });
    assert.strictEqual(result, '');
  });

  it('formats single target with single source', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'docs/missing.md',
        raw: '@docs/missing.md',
        error: 'File not found',
        sources: [{ file: '/path/README.md', line: 10, column: 5 }],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/path',
    });

    assert.ok(result.includes('Broken References:'));
    assert.ok(result.includes('@docs/missing.md'));
    assert.ok(result.includes('File not found'));
    assert.ok(result.includes('README.md (line 10, col 5)'));
  });

  it('formats single target with multiple sources', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'blocks/tools/fastify.md',
        raw: '@blocks/tools/fastify.md',
        error: 'File not found',
        sources: [
          {
            file: '/project/context/blocks/tools/fastify.md',
            line: 10,
            column: 5,
          },
          {
            file: '/project/context/blocks/tools/react.md',
            line: 15,
            column: 3,
          },
        ],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/project',
    });

    assert.ok(result.includes('@blocks/tools/fastify.md'));
    assert.ok(result.includes('context/blocks/tools/fastify.md (line 10, col 5)'));
    assert.ok(result.includes('context/blocks/tools/react.md (line 15, col 3)'));
  });

  it('formats multiple targets sorted alphabetically', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'zebra.md',
        raw: '@zebra.md',
        error: 'Not found',
        sources: [{ file: '/path/a.md', line: 1, column: 1 }],
      },
      {
        targetPath: 'alpha.md',
        raw: '@alpha.md',
        error: 'Not found',
        sources: [{ file: '/path/b.md', line: 2, column: 2 }],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/path',
    });

    const lines = result.split('\n');
    const alphaIndex = lines.findIndex((l) => l.includes('@alpha.md'));
    const zebraIndex = lines.findIndex((l) => l.includes('@zebra.md'));

    assert.ok(alphaIndex < zebraIndex, 'alpha should come before zebra');
  });

  it('respects noColor option', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'test.md',
        raw: '@test.md',
        error: 'Not found',
        sources: [{ file: '/path/source.md', line: 1, column: 1 }],
      },
    ];

    const withColor = formatBrokenReferencesByTarget(broken, { noColor: false });
    const withoutColor = formatBrokenReferencesByTarget(broken, { noColor: true });

    assert.ok(withColor.includes('\x1b['));
    assert.ok(!withoutColor.includes('\x1b['));
  });

  it('uses relative paths from cwd', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'missing.md',
        raw: '@missing.md',
        error: 'Not found',
        sources: [{ file: '/Users/dev/project/docs/file.md', line: 5, column: 10 }],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/Users/dev/project',
    });

    assert.ok(result.includes('docs/file.md'));
    assert.ok(!result.includes('/Users/dev/project'));
  });

  it('includes proper spacing and structure', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'test.md',
        raw: '@test.md',
        error: 'Not found',
        sources: [{ file: '/path/source.md', line: 1, column: 1 }],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/path',
    });

    const lines = result.split('\n');
    assert.strictEqual(lines[0], ''); // Leading blank
    assert.ok(lines[1].includes('Broken References:')); // Header
    assert.strictEqual(lines[2], ''); // Blank after header
    assert.ok(lines[3].includes('@test.md')); // Target
    assert.ok(lines[4].includes('Not found')); // Error
    assert.ok(lines[5].includes('source.md')); // Source
  });

  it('handles multiple sources per target', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'shared.md',
        raw: '@shared.md',
        error: 'File not found',
        sources: [
          { file: '/project/file1.md', line: 10, column: 5 },
          { file: '/project/file2.md', line: 20, column: 10 },
          { file: '/project/file3.md', line: 30, column: 15 },
        ],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/project',
    });

    assert.ok(result.includes('file1.md (line 10, col 5)'));
    assert.ok(result.includes('file2.md (line 20, col 10)'));
    assert.ok(result.includes('file3.md (line 30, col 15)'));
  });

  it('includes blank line between targets', () => {
    const broken: BrokenReferenceByTarget[] = [
      {
        targetPath: 'first.md',
        raw: '@first.md',
        error: 'Not found',
        sources: [{ file: '/path/a.md', line: 1, column: 1 }],
      },
      {
        targetPath: 'second.md',
        raw: '@second.md',
        error: 'Not found',
        sources: [{ file: '/path/b.md', line: 2, column: 2 }],
      },
    ];

    const result = formatBrokenReferencesByTarget(broken, {
      noColor: true,
      cwd: '/path',
    });

    const lines = result.split('\n');
    const firstIndex = lines.findIndex((l) => l.includes('@first.md'));
    const secondIndex = lines.findIndex((l) => l.includes('@second.md'));

    // There should be a blank line between the targets
    assert.ok(secondIndex > firstIndex + 3);
  });
});
