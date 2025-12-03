import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateReferences, validateFile, isValidReference } from '../validator';

describe('validateReferences', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-'));
    fs.writeFileSync(path.join(tempDir, 'exists.ts'), 'export {}');
    fs.writeFileSync(path.join(tempDir, 'another.ts'), 'export {}');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates references and groups results', () => {
    const content = 'See @exists.ts and @missing.ts';
    const result = validateReferences(content, { basePath: tempDir });

    assert.strictEqual(result.stats.total, 2);
    assert.strictEqual(result.stats.valid, 1);
    assert.strictEqual(result.stats.invalid, 1);
    assert.strictEqual(result.valid.length, 1);
    assert.strictEqual(result.invalid.length, 1);
  });

  it('respects ignore patterns', () => {
    const content = 'See @exists.ts and @node_modules/pkg.ts';
    const result = validateReferences(content, {
      basePath: tempDir,
      ignorePatterns: [/node_modules/],
    });

    assert.strictEqual(result.stats.total, 1);
    assert.strictEqual(result.references[0]?.path, 'exists.ts');
  });

  it('returns all valid when all files exist', () => {
    const content = 'See @exists.ts and @another.ts';
    const result = validateReferences(content, { basePath: tempDir });

    assert.strictEqual(result.stats.invalid, 0);
    assert.strictEqual(result.stats.valid, 2);
  });
});

describe('validateFile', () => {
  let tempDir: string;
  let testFile: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-'));
    fs.writeFileSync(path.join(tempDir, 'exists.ts'), 'export {}');
    testFile = path.join(tempDir, 'test.md');
    fs.writeFileSync(testFile, 'See @exists.ts and @missing.ts');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates file from disk', () => {
    const result = validateFile(testFile);

    assert.strictEqual(result.stats.total, 2);
    assert.strictEqual(result.stats.valid, 1);
    assert.strictEqual(result.stats.invalid, 1);
  });
});

describe('isValidReference', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-'));
    fs.writeFileSync(path.join(tempDir, 'exists.ts'), 'export {}');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns true for valid reference', () => {
    assert.strictEqual(isValidReference('exists.ts', tempDir), true);
  });

  it('returns false for invalid reference', () => {
    assert.strictEqual(isValidReference('missing.ts', tempDir), false);
  });
});
