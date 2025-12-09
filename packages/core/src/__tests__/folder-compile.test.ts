import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { compileFolder } from '../compiler';

// Test helper to create temp files
function createTempFile(name: string, content: string, dir: string): string {
  const filePath = path.join(dir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('folder compilation', () => {
  it('compiles folder with no dependencies', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      createTempFile('a.md', '# File A\nNo dependencies', tmpDir);
      createTempFile('b.md', '# File B\nAlso independent', tmpDir);
      createTempFile('c.md', '# File C\nStandalone', tmpDir);

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 3);
      assert.strictEqual(result.totalFailures, 0);
      assert.strictEqual(result.results.length, 3);

      // Verify dist/ folder exists
      const distDir = path.join(tmpDir, 'dist');
      assert.ok(fs.existsSync(distDir));

      // Verify all files compiled
      assert.ok(fs.existsSync(path.join(distDir, 'a.md')));
      assert.ok(fs.existsSync(path.join(distDir, 'b.md')));
      assert.ok(fs.existsSync(path.join(distDir, 'c.md')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('compiles files in dependency order (bottom-up)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      const fileC = createTempFile('c.md', '# Leaf node', tmpDir);
      const fileB = createTempFile('b.md', `# Depends on C\n@${fileC}`, tmpDir);
      const fileA = createTempFile('a.md', `# Depends on B\n@${fileB}`, tmpDir);

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 3);
      assert.strictEqual(result.totalFailures, 0);

      // Verify compilation order: C before B before A
      const paths = result.results.map(r => r.inputPath);
      const indexC = paths.indexOf(fileC);
      const indexB = paths.indexOf(fileB);
      const indexA = paths.indexOf(fileA);

      assert.ok(indexC < indexB, 'C should be compiled before B');
      assert.ok(indexB < indexA, 'B should be compiled before A');

      // Verify A's output contains expanded B and C
      const compiledA = result.results.find(r => r.inputPath === fileA);
      assert.ok(compiledA);
      assert.ok(compiledA.compiledContent.includes('Depends on C'));
      assert.ok(compiledA.compiledContent.includes('Leaf node'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('shares cache across files (cross-file cache validation)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      const common = createTempFile('common.md', '# Common file\nShared content', tmpDir);
      const fileA = createTempFile('a.md', `# File A\n@${common}`, tmpDir);
      const fileB = createTempFile('b.md', `# File B\n@${common}`, tmpDir);

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 3);

      // Both A and B should reference common
      const compiledA = result.results.find(r => r.inputPath === fileA)!;
      const compiledB = result.results.find(r => r.inputPath === fileB)!;

      assert.ok(compiledA);
      assert.ok(compiledB);

      // Check import counts - common should be imported twice
      const commonImportCount = compiledA.importStats.fileImportCounts.get(common) || 0 +
        compiledB.importStats.fileImportCounts.get(common) || 0;

      assert.ok(commonImportCount >= 1, 'common.md should be tracked in import stats');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('optimizes duplicates with --optimize-duplicates flag', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      const common = createTempFile('common.md', '# Common\nShared content here', tmpDir);
      const fileA = createTempFile('a.md', `# File A\n@${common}`, tmpDir);
      const fileB = createTempFile('b.md', `# File B\n@${common}`, tmpDir);

      const result = compileFolder(tmpDir, {
        optimizeDuplicates: true
      });

      assert.strictEqual(result.totalFiles, 3);

      // Find which file was compiled first (should get full content)
      const compiledCommon = result.results.find(r => r.inputPath === common)!;
      const compiledA = result.results.find(r => r.inputPath === fileA)!;
      const compiledB = result.results.find(r => r.inputPath === fileB)!;

      // One of A or B should have full common content, the other should have reference stub
      const aHasFullContent = compiledA.compiledContent.includes('Shared content here');
      const bHasFullContent = compiledB.compiledContent.includes('Shared content here');

      // With bottom-up compilation, common is compiled first
      // Then A, then B. So A should get full content, B should get stub
      assert.ok(aHasFullContent || bHasFullContent, 'At least one should have full content');

      // Check for stub format in the one that doesn't have full content
      const aHasStub = compiledA.compiledContent.includes('<file path="') &&
        compiledA.compiledContent.includes('/>');
      const bHasStub = compiledB.compiledContent.includes('<file path="') &&
        compiledB.compiledContent.includes('/>');

      if (aHasFullContent) {
        assert.ok(bHasStub, 'B should have stub reference');
      } else {
        assert.ok(aHasStub, 'A should have stub reference');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('preserves directory structure in dist/', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      createTempFile('root.md', '# Root', tmpDir);
      createTempFile('nested/file.md', '# Nested', tmpDir);
      createTempFile('nested/deep/file.md', '# Deep', tmpDir);

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 3);

      const distDir = path.join(tmpDir, 'dist');
      assert.ok(fs.existsSync(path.join(distDir, 'root.md')));
      assert.ok(fs.existsSync(path.join(distDir, 'nested', 'file.md')));
      assert.ok(fs.existsSync(path.join(distDir, 'nested', 'deep', 'file.md')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses custom output directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      createTempFile('a.md', '# File A', tmpDir);

      const customOut = path.join(tmpDir, 'build');
      const result = compileFolder(tmpDir, {
        outputDir: customOut
      });

      assert.strictEqual(result.outputDir, customOut);
      assert.ok(fs.existsSync(path.join(customOut, 'a.md')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles empty directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 0);
      assert.strictEqual(result.results.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('continues compilation when some files have errors', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      createTempFile('good.md', '# Good file', tmpDir);
      createTempFile('bad.md', '# Bad file\n@/nonexistent/file.md', tmpDir);
      createTempFile('also-good.md', '# Also good', tmpDir);

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 3);

      // Should have some failures
      assert.ok(result.totalFailures > 0, 'Should have failures from broken ref');

      // But other files should still compile
      const goodResults = result.results.filter(r => r.failedCount === 0);
      assert.ok(goodResults.length >= 2, 'At least 2 files should compile successfully');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects circular dependencies', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      const fileB = createTempFile('b.md', '# File B (will ref A)', tmpDir);
      const fileA = createTempFile('a.md', `# File A\n@${fileB}`, tmpDir);

      // Create cycle
      fs.writeFileSync(fileB, `# File B\n@${fileA}`, 'utf-8');

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 2);

      // Should detect circular files
      assert.ok(result.circularFiles.length > 0, 'Should detect circular dependencies');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records compilation duration', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      createTempFile('a.md', '# File A', tmpDir);

      const result = compileFolder(tmpDir);

      assert.ok(result.duration >= 0, 'Duration should be non-negative');
      assert.ok(typeof result.duration === 'number', 'Duration should be a number');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('aggregates statistics correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-compile-'));

    try {
      const fileC = createTempFile('c.md', '# File C', tmpDir);
      const fileB = createTempFile('b.md', `# File B\n@${fileC}`, tmpDir);
      const fileA = createTempFile('a.md', `# File A\n@${fileB}\n@${fileC}`, tmpDir);

      const result = compileFolder(tmpDir);

      assert.strictEqual(result.totalFiles, 3);

      // A has 2 refs, B has 1 ref, C has 0 refs
      // But recursive expansion means A will have references to both B and C
      assert.ok(result.totalReferences > 0, 'Should have references');

      assert.ok(result.graph);
      assert.strictEqual(result.graph.nodes.size, 3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
