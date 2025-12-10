import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateReferences, validateReferencesRecursive, validateFile, isValidReference } from '../validator';

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

describe('validateReferencesRecursive', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-recursive-'));

    // Create test file structure:
    // a.md -> @b.md, @missing1.md
    // b.md -> @c.md, @missing2.md
    // c.md -> (no refs)
    fs.writeFileSync(path.join(tempDir, 'a.md'), 'See @b.md and @missing1.md');
    fs.writeFileSync(path.join(tempDir, 'b.md'), 'Check @c.md and @missing2.md');
    fs.writeFileSync(path.join(tempDir, 'c.md'), 'No references here');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates all references in dependency tree', () => {
    const aPath = path.join(tempDir, 'a.md');
    const content = fs.readFileSync(aPath, 'utf-8');

    const result = validateReferencesRecursive(content, {
      currentFilePath: aPath,
      basePath: tempDir,
    });

    // Should find: @b.md, @missing1.md (from a.md)
    //              @c.md, @missing2.md (from b.md)
    assert.strictEqual(result.stats.total, 4);
    assert.strictEqual(result.stats.valid, 2); // b.md, c.md
    assert.strictEqual(result.stats.invalid, 2); // missing1.md, missing2.md
  });

  it('handles circular dependencies without infinite loop', () => {
    // Create circular refs: x.md -> @y.md, y.md -> @x.md
    const xPath = path.join(tempDir, 'x.md');
    const yPath = path.join(tempDir, 'y.md');

    fs.writeFileSync(xPath, 'Import @y.md');
    fs.writeFileSync(yPath, 'Import @x.md');

    const content = fs.readFileSync(xPath, 'utf-8');
    const result = validateReferencesRecursive(content, {
      currentFilePath: xPath,
      basePath: tempDir,
    });

    // Should find @y.md from x.md, @x.md from y.md
    // But should not loop infinitely
    assert.strictEqual(result.stats.total, 2);
    assert.strictEqual(result.stats.valid, 2);
  });

  it('matches shallow validation when no nested refs exist', () => {
    const cPath = path.join(tempDir, 'c.md');
    const content = fs.readFileSync(cPath, 'utf-8');

    const shallowResult = validateReferences(content, {
      basePath: tempDir,
    });

    const recursiveResult = validateReferencesRecursive(content, {
      currentFilePath: cPath,
      basePath: tempDir,
    });

    assert.deepStrictEqual(recursiveResult.stats, shallowResult.stats);
  });

  it('respects ignore patterns recursively', () => {
    fs.mkdirSync(path.join(tempDir, 'node_modules'));
    fs.writeFileSync(
      path.join(tempDir, 'node_modules', 'pkg.md'),
      'Import @e.md'
    );
    fs.writeFileSync(
      path.join(tempDir, 'd.md'),
      'Import @node_modules/pkg.md'
    );

    const dPath = path.join(tempDir, 'd.md');
    const content = fs.readFileSync(dPath, 'utf-8');

    const result = validateReferencesRecursive(content, {
      currentFilePath: dPath,
      basePath: tempDir,
      ignorePatterns: [/node_modules/],
    });

    // Should ignore node_modules reference, so no refs found
    assert.strictEqual(result.stats.total, 0);
  });

  it('finds deeply nested references', () => {
    // Create chain: root.md -> level1.md -> level2.md -> level3.md
    const rootPath = path.join(tempDir, 'root.md');

    fs.writeFileSync(rootPath, 'See @level1.md');
    fs.writeFileSync(path.join(tempDir, 'level1.md'), 'See @level2.md');
    fs.writeFileSync(path.join(tempDir, 'level2.md'), 'See @level3.md');
    fs.writeFileSync(path.join(tempDir, 'level3.md'), 'End of chain');

    const content = fs.readFileSync(rootPath, 'utf-8');
    const result = validateReferencesRecursive(content, {
      currentFilePath: rootPath,
      basePath: tempDir,
    });

    // Should find all 3 references
    assert.strictEqual(result.stats.total, 3);
    assert.strictEqual(result.stats.valid, 3);
  });
});

describe('validateFile with shallow and recursive modes', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-test-file-'));

    fs.writeFileSync(path.join(tempDir, 'main.md'), 'Import @dep.md');
    fs.writeFileSync(path.join(tempDir, 'dep.md'), 'Import @nested.md');
    fs.writeFileSync(path.join(tempDir, 'nested.md'), 'No refs');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses recursive validation by default', () => {
    const mainPath = path.join(tempDir, 'main.md');
    const result = validateFile(mainPath);

    // Should find all 2 references (dep.md, nested.md)
    assert.strictEqual(result.stats.total, 2);
    assert.strictEqual(result.stats.valid, 2);
  });

  it('uses shallow validation when requested', () => {
    const mainPath = path.join(tempDir, 'main.md');
    const result = validateFile(mainPath, { shallow: true });

    // Should only find direct reference (dep.md)
    assert.strictEqual(result.stats.total, 1);
    assert.strictEqual(result.stats.valid, 1);
  });
});
