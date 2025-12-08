import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { compileFile, compileContent, getBuiltOutputPath } from '../compiler';

describe('getBuiltOutputPath', () => {
  it('adds .built suffix before extension', () => {
    assert.strictEqual(getBuiltOutputPath('README.md'), 'README.built.md');
    assert.strictEqual(getBuiltOutputPath('docs/CLAUDE.md'), path.join('docs', 'CLAUDE.built.md'));
    assert.strictEqual(getBuiltOutputPath('/abs/path/file.txt'), path.join('/abs/path', 'file.built.txt'));
  });

  it('handles files without extension', () => {
    assert.strictEqual(getBuiltOutputPath('Makefile'), 'Makefile.built');
  });
});

describe('compileContent', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-compile-'));
    fs.writeFileSync(path.join(tempDir, 'hello.ts'), 'console.log("hello");');
    fs.writeFileSync(path.join(tempDir, 'config.json'), '{"key": "value"}');
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export * from "./main";');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('compiles content with @references', () => {
    const content = 'See @hello.ts for details';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 1);
    assert.strictEqual(result.references[0]?.found, true);
    assert.ok(result.compiledContent.includes('console.log("hello");'));
    assert.ok(result.compiledContent.includes('<!-- @hello.ts -->'));
  });

  it('handles multiple references', () => {
    const content = 'Check @hello.ts and @config.json';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 2);
    assert.strictEqual(result.references.filter(r => r.found).length, 2);
    assert.ok(result.compiledContent.includes('console.log("hello");'));
    assert.ok(result.compiledContent.includes('"key": "value"'));
  });

  it('handles missing references gracefully', () => {
    const content = 'See @hello.ts and @missing.ts';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 2);
    assert.strictEqual(result.references[0]?.found, true);
    assert.strictEqual(result.references[1]?.found, false);
    assert.ok(result.references[1]?.error);
  });

  it('handles nested paths', () => {
    const content = 'Import from @src/index.ts';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 1);
    assert.strictEqual(result.references[0]?.found, true);
    assert.ok(result.compiledContent.includes('export * from "./main";'));
  });

  it('preserves content without references', () => {
    const content = 'No references here, just plain text.';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 0);
    assert.strictEqual(result.compiledContent, content);
  });

  it('handles directories as errors', () => {
    const content = 'See @src/ for details';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 1);
    assert.strictEqual(result.references[0]?.found, false);
    assert.ok(result.references[0]?.error?.includes('directory'));
  });
});

describe('compileFile', () => {
  let tempDir: string;
  let inputFile: string;
  let refFile: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-compile-'));
    refFile = path.join(tempDir, 'utils.ts');
    fs.writeFileSync(refFile, 'export function helper() { return 42; }');

    inputFile = path.join(tempDir, 'doc.md');
    fs.writeFileSync(inputFile, '# Documentation\n\nSee @utils.ts for helper functions.');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('compiles file and writes output', () => {
    const result = compileFile(inputFile);

    assert.strictEqual(result.successCount, 1);
    assert.strictEqual(result.failedCount, 0);
    assert.strictEqual(result.written, true);
    assert.ok(fs.existsSync(result.outputPath));

    const output = fs.readFileSync(result.outputPath, 'utf-8');
    assert.ok(output.includes('# Documentation'));
    assert.ok(output.includes('export function helper()'));
    assert.ok(output.includes('<!-- @utils.ts -->'));
  });

  it('uses custom output path', () => {
    const customOutput = path.join(tempDir, 'custom-output.md');
    const result = compileFile(inputFile, { outputPath: customOutput });

    assert.strictEqual(result.outputPath, customOutput);
    assert.ok(fs.existsSync(customOutput));
  });

  it('can skip writing output', () => {
    const result = compileFile(inputFile, { writeOutput: false });

    assert.strictEqual(result.written, false);
    assert.ok(result.compiledContent.includes('export function helper()'));
  });

  it('supports custom content wrapper', () => {
    const customWrapper = (content: string, filePath: string) =>
      `<file path="${filePath}">\n${content}\n</file>`;

    const result = compileFile(inputFile, {
      writeOutput: false,
      contentWrapper: customWrapper
    });

    assert.ok(result.compiledContent.includes('<file path="'));
    assert.ok(result.compiledContent.includes('</file>'));
  });
});
