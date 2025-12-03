import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolvePath, pathExists } from '../resolver';

describe('resolvePath', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-'));
    fs.writeFileSync(path.join(tempDir, 'file.ts'), 'export {}');
    fs.mkdirSync(path.join(tempDir, 'subdir'));
    fs.writeFileSync(path.join(tempDir, 'subdir', 'nested.ts'), 'export {}');
    fs.mkdirSync(path.join(tempDir, 'indexed'));
    fs.writeFileSync(path.join(tempDir, 'indexed', 'index.ts'), 'export {}');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves bare path relative to basePath', () => {
    const result = resolvePath('file.ts', { basePath: tempDir });
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.resolvedPath, path.join(tempDir, 'file.ts'));
  });

  it('resolves ./ path relative to basePath', () => {
    const result = resolvePath('./file.ts', { basePath: tempDir });
    assert.strictEqual(result.exists, true);
  });

  it('resolves ../ path', () => {
    const subPath = path.join(tempDir, 'subdir');
    const result = resolvePath('../file.ts', { basePath: subPath });
    assert.strictEqual(result.exists, true);
  });

  it('resolves nested path', () => {
    const result = resolvePath('subdir/nested.ts', { basePath: tempDir });
    assert.strictEqual(result.exists, true);
  });

  it('returns exists: false for missing file', () => {
    const result = resolvePath('missing.ts', { basePath: tempDir });
    assert.strictEqual(result.exists, false);
    assert.ok(result.error);
  });

  it('detects directories', () => {
    const result = resolvePath('subdir', { basePath: tempDir });
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.isDirectory, true);
  });

  it('tries extensions', () => {
    const result = resolvePath('file', {
      basePath: tempDir,
      tryExtensions: ['.ts', '.js'],
    });
    assert.strictEqual(result.exists, true);
    assert.ok(result.resolvedPath.endsWith('.ts'));
  });

  it('finds index files when directory name matches', () => {
    // When "indexed" dir exists, we return the directory itself
    const result = resolvePath('indexed', {
      basePath: tempDir,
      tryExtensions: ['.ts'],
    });
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.isDirectory, true);
  });

  it('finds index files when path does not exist', () => {
    // When we reference indexed/index without extension, find index.ts
    const result = resolvePath('indexed/index', {
      basePath: tempDir,
      tryExtensions: ['.ts'],
    });
    assert.strictEqual(result.exists, true);
    assert.ok(result.resolvedPath.endsWith('index.ts'));
  });
});

describe('pathExists', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-'));
    fs.writeFileSync(path.join(tempDir, 'exists.ts'), 'export {}');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns true for existing file', () => {
    assert.strictEqual(pathExists('exists.ts', tempDir), true);
  });

  it('returns false for missing file', () => {
    assert.strictEqual(pathExists('missing.ts', tempDir), false);
  });
});
