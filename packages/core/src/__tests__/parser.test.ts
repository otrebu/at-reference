import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractReferences } from '../parser';

describe('extractReferences', () => {
  it('extracts basic reference', () => {
    const refs = extractReferences('See @src/index.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'src/index.ts');
    assert.strictEqual(refs[0]?.raw, '@src/index.ts');
  });

  it('extracts reference with extension only', () => {
    const refs = extractReferences('See @file.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'file.ts');
  });

  it('extracts relative path with ./', () => {
    const refs = extractReferences('See @./relative.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, './relative.ts');
  });

  it('extracts parent path with ../', () => {
    const refs = extractReferences('See @../parent.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, '../parent.ts');
  });

  it('extracts root-relative path', () => {
    const refs = extractReferences('See @/root/file.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, '/root/file.ts');
  });

  it('extracts multiple references', () => {
    const refs = extractReferences('See @file1.ts and @file2.ts');
    assert.strictEqual(refs.length, 2);
    assert.strictEqual(refs[0]?.path, 'file1.ts');
    assert.strictEqual(refs[1]?.path, 'file2.ts');
  });

  it('ignores email addresses', () => {
    const refs = extractReferences('Contact user@example.com');
    assert.strictEqual(refs.length, 0);
  });

  it('ignores decorators without path', () => {
    const refs = extractReferences('@Component class Foo {}');
    assert.strictEqual(refs.length, 0);
  });

  it('extracts reference in brackets', () => {
    const refs = extractReferences('See [@file.ts]');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'file.ts');
  });

  it('extracts reference in parentheses', () => {
    const refs = extractReferences('See (@file.ts)');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'file.ts');
  });

  it('reports correct line number (1-indexed)', () => {
    const refs = extractReferences('Line 1\nSee @file.ts\nLine 3');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.line, 2);
  });

  it('reports correct column number (1-indexed)', () => {
    const refs = extractReferences('See @file.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.column, 5);
  });

  it('supports 0-indexed positions', () => {
    const refs = extractReferences('See @file.ts', { zeroIndexed: true });
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.line, 0);
    assert.strictEqual(refs[0]?.column, 4);
  });

  it('handles CRLF line endings', () => {
    const refs = extractReferences('Line 1\r\nSee @file.ts\r\nLine 3');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.line, 2);
  });

  it('handles paths with dashes and underscores', () => {
    const refs = extractReferences('See @path-with-dashes/file_underscores.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'path-with-dashes/file_underscores.ts');
  });

  it('returns empty array for empty string', () => {
    const refs = extractReferences('');
    assert.strictEqual(refs.length, 0);
  });

  it('returns empty array for text without references', () => {
    const refs = extractReferences('No references here');
    assert.strictEqual(refs.length, 0);
  });

  it('handles reference at start of text', () => {
    const refs = extractReferences('@file.ts is the main file');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.column, 1);
  });

  it('handles multiple references on same line', () => {
    const refs = extractReferences('@file1.ts @file2.ts @file3.ts');
    assert.strictEqual(refs.length, 3);
  });

  it('ignores reference inside inline code (backticks)', () => {
    const refs = extractReferences('See `@src/file.ts` for example');
    assert.strictEqual(refs.length, 0);
  });

  it('ignores reference inside fenced code block', () => {
    const refs = extractReferences('```\n@src/file.ts\n```');
    assert.strictEqual(refs.length, 0);
  });

  it('ignores reference inside fenced code block with language', () => {
    const refs = extractReferences('```typescript\nimport from "@src/file.ts"\n```');
    assert.strictEqual(refs.length, 0);
  });

  it('extracts reference outside backticks but ignores one inside', () => {
    const refs = extractReferences('See @real/file.ts and `@fake/file.ts`');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'real/file.ts');
  });

  it('handles multiple inline code spans', () => {
    const refs = extractReferences('Use `@a/b.ts` or `@c/d.ts` but @real/ref.ts works');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'real/ref.ts');
  });

  it('handles code block followed by real reference', () => {
    const refs = extractReferences('```\n@code/block.ts\n```\nSee @real/file.ts');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'real/file.ts');
  });

  it('handles inline code at start of text', () => {
    const refs = extractReferences('`@src/file.ts` is the path');
    assert.strictEqual(refs.length, 0);
  });

  it('handles inline code at end of text', () => {
    const refs = extractReferences('The path is `@src/file.ts`');
    assert.strictEqual(refs.length, 0);
  });

  it('extracts reference when backticks are not paired', () => {
    const refs = extractReferences('See @src/file.ts in `unclosed code');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0]?.path, 'src/file.ts');
  });
});
