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

  it('compiles content with @references using XML tags', () => {
    const content = 'See @hello.ts for details';
    const result = compileContent(content, { basePath: tempDir });

    assert.strictEqual(result.references.length, 1);
    assert.strictEqual(result.references[0]?.found, true);
    assert.ok(result.compiledContent.includes('console.log("hello");'));
    assert.ok(result.compiledContent.includes('<file path="'));
    assert.ok(result.compiledContent.includes('</file>'));
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

  it('compiles file and writes output with XML tags', () => {
    const result = compileFile(inputFile);

    assert.strictEqual(result.successCount, 1);
    assert.strictEqual(result.failedCount, 0);
    assert.strictEqual(result.written, true);
    assert.ok(fs.existsSync(result.outputPath));

    const output = fs.readFileSync(result.outputPath, 'utf-8');
    assert.ok(output.includes('# Documentation'));
    assert.ok(output.includes('export function helper()'));
    assert.ok(output.includes('<file path="'));
    assert.ok(output.includes('</file>'));
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
      `<custom path="${filePath}">\n${content}\n</custom>`;

    const result = compileFile(inputFile, {
      writeOutput: false,
      contentWrapper: customWrapper
    });

    assert.ok(result.compiledContent.includes('<custom path="'));
    assert.ok(result.compiledContent.includes('</custom>'));
  });
});

describe('recursive compilation', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-recursive-'));

    // Create a chain: A -> B -> C
    fs.writeFileSync(path.join(tempDir, 'a.md'), '# File A\n\nIncludes B: @b.md');
    fs.writeFileSync(path.join(tempDir, 'b.md'), '# File B\n\nIncludes C: @c.md');
    fs.writeFileSync(path.join(tempDir, 'c.md'), '# File C\n\nThis is the deepest file.');

    // Create files for circular dependency test
    fs.writeFileSync(path.join(tempDir, 'circular-a.md'), '# Circular A\n\nReferences B: @circular-b.md');
    fs.writeFileSync(path.join(tempDir, 'circular-b.md'), '# Circular B\n\nReferences A: @circular-a.md');

    // Create a file that references multiple files
    fs.writeFileSync(path.join(tempDir, 'multi.md'), '# Multi\n\nIncludes @c.md and @b.md');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('recursively compiles nested @references', () => {
    const result = compileFile(path.join(tempDir, 'a.md'), { writeOutput: false });

    // Should include content from all three files
    assert.ok(result.compiledContent.includes('# File A'));
    assert.ok(result.compiledContent.includes('# File B'));
    assert.ok(result.compiledContent.includes('# File C'));
    assert.ok(result.compiledContent.includes('This is the deepest file.'));

    // Should have references from both A and B
    const foundRefs = result.references.filter(r => r.found);
    assert.strictEqual(foundRefs.length, 2); // b.md from A, c.md from B
  });

  it('detects circular dependencies', () => {
    const result = compileFile(path.join(tempDir, 'circular-a.md'), { writeOutput: false });

    // Should include content from both files
    assert.ok(result.compiledContent.includes('# Circular A'));
    assert.ok(result.compiledContent.includes('# Circular B'));

    // Should detect the circular reference back to A
    const circularRef = result.references.find(r => r.circular);
    assert.ok(circularRef, 'Should have detected a circular reference');
    assert.ok(circularRef.error?.includes('Circular dependency'));
  });

  it('handles multiple references at same level', () => {
    const result = compileFile(path.join(tempDir, 'multi.md'), { writeOutput: false });

    // Should include both referenced files
    assert.ok(result.compiledContent.includes('# File C'));
    assert.ok(result.compiledContent.includes('# File B'));
  });

  it('compileContent also supports recursive compilation', () => {
    const content = 'Root doc includes @a.md';
    const result = compileContent(content, { basePath: tempDir });

    // Should have recursively compiled all nested references
    assert.ok(result.compiledContent.includes('# File A'));
    assert.ok(result.compiledContent.includes('# File B'));
    assert.ok(result.compiledContent.includes('# File C'));
  });
});

describe('frontmatter and newlines', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-frontmatter-'));
    fs.writeFileSync(path.join(tempDir, 'simple.txt'), 'Hello World');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('always strips frontmatter from compiled output', () => {
    const contentWithFrontmatter = `---
title: Test Document
author: Test Author
---

# Content

Reference to @simple.txt`;

    const result = compileContent(contentWithFrontmatter, { basePath: tempDir });

    // Should not contain frontmatter
    assert.ok(!result.compiledContent.includes('title: Test Document'));
    assert.ok(!result.compiledContent.includes('author: Test Author'));
    assert.ok(!result.compiledContent.includes('---'));
    // Should contain content
    assert.ok(result.compiledContent.includes('# Content'));
  });

  it('uses double newlines for blank lines around file tags', () => {
    const content = 'Text @simple.txt here';
    const result = compileContent(content, { basePath: tempDir });

    // Should have blank line after opening tag (double newline)
    assert.ok(result.compiledContent.includes('<file path="'));
    assert.ok(result.compiledContent.includes('">\n\n'));
    // Should have blank line before closing tag (double newline)
    assert.ok(result.compiledContent.includes('\n\n</file>'));
  });

  it('handles files without frontmatter correctly', () => {
    const contentWithoutFrontmatter = `# Simple Document

Reference to @simple.txt`;

    const result = compileContent(contentWithoutFrontmatter, { basePath: tempDir });

    // Should contain all content
    assert.ok(result.compiledContent.includes('# Simple Document'));
    assert.ok(result.compiledContent.includes('Hello World'));
  });
});

describe('heading level adjustment', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-heading-'));

    // Create test files for single-level import
    fs.writeFileSync(path.join(tempDir, 'parent.md'),
      '# Parent\n## Section\n@child.md');

    fs.writeFileSync(path.join(tempDir, 'child.md'),
      '# Child Title\n## Child Section');

    // Create test files for nested imports (3 levels)
    fs.writeFileSync(path.join(tempDir, 'nested-a.md'),
      '# A\n## A Section\n@nested-b.md');

    fs.writeFileSync(path.join(tempDir, 'nested-b.md'),
      '# B\n## B Section\n@nested-c.md');

    fs.writeFileSync(path.join(tempDir, 'nested-c.md'),
      '# C\nC content');

    // Create test files for deep nesting (h6 clamping)
    fs.writeFileSync(path.join(tempDir, 'deep.md'),
      '##### H5\n@child.md');

    // Create test files for code blocks
    fs.writeFileSync(path.join(tempDir, 'with-code.md'),
      '## Section\n@code-file.md');

    fs.writeFileSync(path.join(tempDir, 'code-file.md'),
      '```markdown\n# Not a real heading\n```\n# Real heading');

    // Create test files for no preceding heading
    fs.writeFileSync(path.join(tempDir, 'no-heading.md'),
      '@child.md\n\n# After import');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shifts child headings based on parent context', () => {
    const result = compileFile(path.join(tempDir, 'parent.md'), {
      writeOutput: false
    });

    // Child's # should become ### (shifted +2)
    assert.ok(result.compiledContent.includes('### Child Title'));
    assert.ok(result.compiledContent.includes('#### Child Section'));
    // Parent headings unchanged
    assert.ok(result.compiledContent.includes('# Parent'));
    assert.ok(result.compiledContent.includes('## Section'));
  });

  it('accumulates shifts through nested imports', () => {
    const result = compileFile(path.join(tempDir, 'nested-a.md'), {
      writeOutput: false
    });

    // B shifted by +2 (from A's h2 context)
    assert.ok(result.compiledContent.includes('### B'));
    assert.ok(result.compiledContent.includes('#### B Section'));
    // C shifted by +4 (accumulated: A's context + B's context)
    assert.ok(result.compiledContent.includes('##### C'));
  });

  it('clamps headings at h6', () => {
    const result = compileFile(path.join(tempDir, 'deep.md'), {
      writeOutput: false
    });

    // Child's ## would become h7 (5 + 2), but should clamp to h6
    assert.ok(result.compiledContent.includes('###### Child Section'));
    // Should NOT have h7
    assert.ok(!result.compiledContent.includes('####### '));
  });

  it('does not shift headings in code blocks', () => {
    const result = compileFile(path.join(tempDir, 'with-code.md'), {
      writeOutput: false
    });

    // Code block heading should be unchanged
    assert.ok(result.compiledContent.includes('```markdown\n# Not a real heading\n```'));
    // Real heading should be shifted (h1 + h2 context = h3)
    assert.ok(result.compiledContent.includes('### Real heading'));
  });

  it('handles imports with no preceding heading (context level 0)', () => {
    const result = compileFile(path.join(tempDir, 'no-heading.md'), {
      writeOutput: false
    });

    // Child headings should NOT be shifted (context level 0)
    assert.ok(result.compiledContent.includes('# Child Title'));
    assert.ok(result.compiledContent.includes('## Child Section'));
    // "After import" heading remains unchanged
    assert.ok(result.compiledContent.includes('# After import'));
  });

  it('works with compileContent function', () => {
    const content = '## Section\n@child.md';
    const result = compileContent(content, { basePath: tempDir });

    // Should shift child headings by +2
    assert.ok(result.compiledContent.includes('### Child Title'));
    assert.ok(result.compiledContent.includes('#### Child Section'));
  });

  it('handles multiple imports with different contexts', () => {
    fs.writeFileSync(path.join(tempDir, 'multi-context.md'),
      '# H1\n@child.md\n## H2\n@child.md\n### H3\n@child.md');

    const result = compileFile(path.join(tempDir, 'multi-context.md'), {
      writeOutput: false
    });

    // First occurrence: shifted by +1 (after h1)
    const firstOccurrence = result.compiledContent.indexOf('## Child Title');
    assert.ok(firstOccurrence > -1, 'First child should be shifted to h2');

    // Second occurrence: shifted by +2 (after h2)
    const secondOccurrence = result.compiledContent.indexOf('### Child Title', firstOccurrence + 1);
    assert.ok(secondOccurrence > -1, 'Second child should be shifted to h3');

    // Third occurrence: shifted by +3 (after h3)
    const thirdOccurrence = result.compiledContent.indexOf('#### Child Title', secondOccurrence + 1);
    assert.ok(thirdOccurrence > -1, 'Third child should be shifted to h4');
  });

  it('preserves content outside headings', () => {
    fs.writeFileSync(path.join(tempDir, 'with-content.md'),
      '# Title\nSome text\n- List item\n@child-with-content.md');

    fs.writeFileSync(path.join(tempDir, 'child-with-content.md'),
      '# Heading\nParagraph\n```code```\n## Section');

    const result = compileFile(path.join(tempDir, 'with-content.md'), {
      writeOutput: false
    });

    // Check content preserved
    assert.ok(result.compiledContent.includes('Some text'));
    assert.ok(result.compiledContent.includes('- List item'));
    assert.ok(result.compiledContent.includes('Paragraph'));
    assert.ok(result.compiledContent.includes('```code```'));
    // Check headings shifted
    assert.ok(result.compiledContent.includes('## Heading')); // h1 -> h2
    assert.ok(result.compiledContent.includes('### Section')); // h2 -> h3
  });
});

describe('heading normalization mode', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ref-normalize-'));

    // Create test files where child starts with h2 (not h1)
    // This is where normalize differs from additive
    fs.writeFileSync(path.join(tempDir, 'parent.md'),
      '# Parent\n## Section\n@child-h2.md');

    fs.writeFileSync(path.join(tempDir, 'child-h2.md'),
      '## Commander\n### Usage\n#### Example');

    // Nested test with non-h1 starting files
    fs.writeFileSync(path.join(tempDir, 'root.md'),
      '# Root\n## Section\n@middle.md');

    fs.writeFileSync(path.join(tempDir, 'middle.md'),
      '### Middle Title\n#### Middle Sub\n@leaf.md');

    fs.writeFileSync(path.join(tempDir, 'leaf.md'),
      '## Leaf Title\n### Leaf Sub');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('preserves relative hierarchy with normalize mode (default)', () => {
    const result = compileFile(path.join(tempDir, 'parent.md'), {
      writeOutput: false,
      // headingMode defaults to 'normalize'
    });

    // Context is h2, target = h3
    // Child starts with h2, shift = h3 - h2 = +1
    // h2 → h3, h3 → h4, h4 → h5
    assert.ok(result.compiledContent.includes('### Commander'));
    assert.ok(result.compiledContent.includes('#### Usage'));
    assert.ok(result.compiledContent.includes('##### Example'));

    // Parent headings unchanged
    assert.ok(result.compiledContent.includes('# Parent'));
    assert.ok(result.compiledContent.includes('## Section'));
  });

  it('preserves relative hierarchy in nested imports with normalize mode', () => {
    const result = compileFile(path.join(tempDir, 'root.md'), {
      writeOutput: false,
    });

    // Leaf imported into middle (context h4):
    //   target = h5, leaf starts h2, shift = +3
    //   h2 → h5, h3 → h6

    // Middle imported into root (context h2):
    //   target = h3, middle starts h3, shift = 0
    //   All headings in middle (including leaf) shift +0
    //   So middle stays h3, h4, and leaf stays h5, h6

    assert.ok(result.compiledContent.includes('### Middle Title'));
    assert.ok(result.compiledContent.includes('#### Middle Sub'));
    assert.ok(result.compiledContent.includes('##### Leaf Title'));
    assert.ok(result.compiledContent.includes('###### Leaf Sub'));
  });

  it('uses additive shift with headingMode: additive', () => {
    const result = compileFile(path.join(tempDir, 'parent.md'), {
      writeOutput: false,
      headingMode: 'additive',
    });

    // Context is h2, additive shift = +2
    // h2 → h4, h3 → h5, h4 → h6
    assert.ok(result.compiledContent.includes('#### Commander'));
    assert.ok(result.compiledContent.includes('##### Usage'));
    assert.ok(result.compiledContent.includes('###### Example'));
  });

  it('normalizes to h1 when no preceding heading', () => {
    fs.writeFileSync(path.join(tempDir, 'no-heading-parent.md'),
      '@child-h2.md\n\n# After');

    const result = compileFile(path.join(tempDir, 'no-heading-parent.md'), {
      writeOutput: false,
    });

    // Context = 0, target = 1
    // Child starts h2, shift = -1
    // h2 → h1, h3 → h2, h4 → h3
    assert.ok(result.compiledContent.includes('# Commander'));
    assert.ok(result.compiledContent.includes('## Usage'));
    assert.ok(result.compiledContent.includes('### Example'));
  });

  it('does not normalize root file headings', () => {
    const result = compileFile(path.join(tempDir, 'child-h2.md'), {
      writeOutput: false,
    });

    // Root file (no parent import) should keep original headings
    assert.ok(result.compiledContent.includes('## Commander'));
    assert.ok(result.compiledContent.includes('### Usage'));
    assert.ok(result.compiledContent.includes('#### Example'));
  });
});
