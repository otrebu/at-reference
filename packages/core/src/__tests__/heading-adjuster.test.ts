import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractHeadings,
  adjustHeadings,
  analyzeHeadingContext,
  findCodeBlockRanges,
  isInsideCodeBlock,
  normalizeHeadings,
} from '../heading-adjuster';
import type { AtReference } from '../types';

describe('findCodeBlockRanges', () => {
  it('finds fenced code blocks', () => {
    const content = `Some text
\`\`\`javascript
code here
\`\`\`
More text`;

    const ranges = findCodeBlockRanges(content);

    assert.strictEqual(ranges.length, 1);
    assert.ok(ranges[0]);
    assert.ok(content.slice(ranges[0].start, ranges[0].end).includes('javascript'));
  });

  it('finds inline code spans', () => {
    const content = 'Check `inline code` here';

    const ranges = findCodeBlockRanges(content);

    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(content.slice(ranges[0]!.start, ranges[0]!.end), '`inline code`');
  });

  it('handles multiple code blocks', () => {
    const content = `\`\`\`
block1
\`\`\`
text
\`\`\`
block2
\`\`\``;

    const ranges = findCodeBlockRanges(content);

    assert.strictEqual(ranges.length, 2);
  });

  it('does not include inline code inside fenced blocks', () => {
    const content = `\`\`\`
code with \`backticks\` inside
\`\`\``;

    const ranges = findCodeBlockRanges(content);

    assert.strictEqual(ranges.length, 1);
    // Only the fenced block, not the inline backticks
  });

  it('handles empty content', () => {
    const ranges = findCodeBlockRanges('');

    assert.strictEqual(ranges.length, 0);
  });
});

describe('isInsideCodeBlock', () => {
  it('returns true for positions inside code blocks', () => {
    const ranges = [{ start: 10, end: 20 }];

    assert.strictEqual(isInsideCodeBlock(15, ranges), true);
  });

  it('returns false for positions outside code blocks', () => {
    const ranges = [{ start: 10, end: 20 }];

    assert.strictEqual(isInsideCodeBlock(5, ranges), false);
    assert.strictEqual(isInsideCodeBlock(25, ranges), false);
  });

  it('returns false for edge positions', () => {
    const ranges = [{ start: 10, end: 20 }];

    assert.strictEqual(isInsideCodeBlock(10, ranges), true);
    assert.strictEqual(isInsideCodeBlock(20, ranges), false); // end is exclusive
  });

  it('handles empty ranges', () => {
    assert.strictEqual(isInsideCodeBlock(10, []), false);
  });
});

describe('extractHeadings', () => {
  it('extracts ATX headings with correct levels', () => {
    const content = `# Title
## Section
### Subsection
#### Level 4
##### Level 5
###### Level 6`;

    const headings = extractHeadings(content);

    assert.strictEqual(headings.length, 6);
    assert.strictEqual(headings[0]?.level, 1);
    assert.strictEqual(headings[0]?.text, 'Title');
    assert.strictEqual(headings[1]?.level, 2);
    assert.strictEqual(headings[1]?.text, 'Section');
    assert.strictEqual(headings[2]?.level, 3);
    assert.strictEqual(headings[5]?.level, 6);
  });

  it('ignores headings in fenced code blocks', () => {
    const content = `# Real Heading
\`\`\`markdown
# Fake Heading
\`\`\`
## Another Real Heading`;

    const headings = extractHeadings(content);

    assert.strictEqual(headings.length, 2);
    assert.strictEqual(headings[0]?.text, 'Real Heading');
    assert.strictEqual(headings[1]?.text, 'Another Real Heading');
  });

  it('ignores headings in inline code', () => {
    const content = `# Title
Use \`# heading\` syntax for titles`;

    const headings = extractHeadings(content);

    assert.strictEqual(headings.length, 1);
    assert.strictEqual(headings[0]?.text, 'Title');
  });

  it('handles empty content', () => {
    const headings = extractHeadings('');

    assert.strictEqual(headings.length, 0);
  });

  it('handles content with no headings', () => {
    const content = 'Just plain text\nNo headings here';

    const headings = extractHeadings(content);

    assert.strictEqual(headings.length, 0);
  });

  it('preserves heading order', () => {
    const content = `## Second
# First (but appears second)
### Third`;

    const headings = extractHeadings(content);

    assert.strictEqual(headings.length, 3);
    assert.strictEqual(headings[0]?.level, 2);
    assert.strictEqual(headings[1]?.level, 1);
    assert.strictEqual(headings[2]?.level, 3);
  });

  it('records correct positions', () => {
    const content = '# Title\nSome text\n## Section';

    const headings = extractHeadings(content);

    assert.strictEqual(headings[0]?.position, 0);
    assert.ok((headings[1]?.position ?? 0) > 0);
  });

  it('trims heading text', () => {
    const content = '#   Title with spaces   ';

    const headings = extractHeadings(content);

    assert.strictEqual(headings[0]?.text, 'Title with spaces');
  });
});

describe('adjustHeadings', () => {
  it('shifts headings by positive amount', () => {
    const content = `# Title
## Section
### Subsection`;

    const adjusted = adjustHeadings(content, 2, false);

    assert.ok(adjusted.includes('### Title'));
    assert.ok(adjusted.includes('#### Section'));
    assert.ok(adjusted.includes('##### Subsection'));
  });

  it('does not modify content when shift is 0', () => {
    const content = '# Title\n## Section';

    const adjusted = adjustHeadings(content, 0, false);

    assert.strictEqual(adjusted, content);
  });

  it('clamps headings at h6', () => {
    const content = `#### H4
##### H5
###### H6`;

    const adjusted = adjustHeadings(content, 3, false);

    assert.ok(adjusted.includes('###### H4')); // 4+3=7 → clamped to 6
    assert.ok(adjusted.includes('###### H5')); // 5+3=8 → clamped to 6
    assert.ok(adjusted.includes('###### H6')); // 6+3=9 → clamped to 6
    assert.ok(!adjusted.includes('#######')); // No h7
  });

  it('warns when clamping occurs', () => {
    const content = '###### H6';

    // Capture console.warn
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => { warnCalled = true; };

    adjustHeadings(content, 1, true);

    console.warn = originalWarn;
    assert.strictEqual(warnCalled, true);
  });

  it('does not warn when warnOnClamp is false', () => {
    const content = '###### H6';

    // Capture console.warn
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => { warnCalled = true; };

    adjustHeadings(content, 1, false);

    console.warn = originalWarn;
    assert.strictEqual(warnCalled, false);
  });

  it('ignores headings in code blocks', () => {
    const content = `## Real Heading
\`\`\`markdown
# Fake Heading
\`\`\`
### Another Real`;

    const adjusted = adjustHeadings(content, 1, false);

    assert.ok(adjusted.includes('### Real Heading'));
    assert.ok(adjusted.includes('# Fake Heading')); // Unchanged
    assert.ok(adjusted.includes('#### Another Real'));
  });

  it('handles empty content', () => {
    const adjusted = adjustHeadings('', 2, false);

    assert.strictEqual(adjusted, '');
  });

  it('maintains content integrity (only headings change)', () => {
    const content = `# Title
Some paragraph text here.
## Section
More content.
- List item
- Another item`;

    const adjusted = adjustHeadings(content, 1, false);

    // Check headings changed
    assert.ok(adjusted.includes('## Title'));
    assert.ok(adjusted.includes('### Section'));
    // Check content preserved
    assert.ok(adjusted.includes('Some paragraph text here.'));
    assert.ok(adjusted.includes('More content.'));
    assert.ok(adjusted.includes('- List item'));
    assert.ok(adjusted.includes('- Another item'));
  });

  it('handles headings with special characters', () => {
    const content = '# Title with `code` and *emphasis*';

    const adjusted = adjustHeadings(content, 1, false);

    assert.ok(adjusted.includes('## Title with `code` and *emphasis*'));
  });

  it('handles multiple headings in sequence', () => {
    const content = `# H1
## H2
## Another H2
### H3`;

    const adjusted = adjustHeadings(content, 2, false);

    assert.ok(adjusted.includes('### H1'));
    assert.ok(adjusted.includes('#### H2'));
    assert.ok(adjusted.includes('#### Another H2'));
    assert.ok(adjusted.includes('##### H3'));
  });
});

describe('analyzeHeadingContext', () => {
  it('maps reference to last preceding heading', () => {
    const content = `# Title
Some text
## Section
@file.md`;

    const references: AtReference[] = [{
      raw: '@file.md',
      path: 'file.md',
      startIndex: content.indexOf('@file.md'),
      endIndex: content.indexOf('@file.md') + '@file.md'.length,
      line: 4,
      column: 1,
    }];

    const contextMap = analyzeHeadingContext(content, references);

    const context = contextMap.get(references[0]!.startIndex);
    assert.ok(context);
    assert.strictEqual(context.contextLevel, 2); // Last heading was h2
    assert.strictEqual(context.shiftAmount, 2);
  });

  it('assigns contextLevel 0 when no preceding heading', () => {
    const content = '@file.md\n\n# Title after';

    const references: AtReference[] = [{
      raw: '@file.md',
      path: 'file.md',
      startIndex: 0,
      endIndex: '@file.md'.length,
      line: 1,
      column: 1,
    }];

    const contextMap = analyzeHeadingContext(content, references);

    const context = contextMap.get(0);
    assert.ok(context);
    assert.strictEqual(context.contextLevel, 0);
    assert.strictEqual(context.shiftAmount, 0);
  });

  it('handles multiple references with different contexts', () => {
    const content = `# Title
@ref1.md
## Section
@ref2.md
### Subsection
@ref3.md`;

    const ref1Start = content.indexOf('@ref1.md');
    const ref2Start = content.indexOf('@ref2.md');
    const ref3Start = content.indexOf('@ref3.md');

    const references: AtReference[] = [
      { raw: '@ref1.md', path: 'ref1.md', startIndex: ref1Start, endIndex: ref1Start + 8, line: 2, column: 1 },
      { raw: '@ref2.md', path: 'ref2.md', startIndex: ref2Start, endIndex: ref2Start + 8, line: 4, column: 1 },
      { raw: '@ref3.md', path: 'ref3.md', startIndex: ref3Start, endIndex: ref3Start + 8, line: 6, column: 1 },
    ];

    const contextMap = analyzeHeadingContext(content, references);

    assert.strictEqual(contextMap.get(ref1Start)?.contextLevel, 1);
    assert.strictEqual(contextMap.get(ref2Start)?.contextLevel, 2);
    assert.strictEqual(contextMap.get(ref3Start)?.contextLevel, 3);
  });

  it('ignores headings in code blocks when determining context', () => {
    const content = `\`\`\`
# Fake Heading
\`\`\`
## Real Heading
@file.md`;

    const references: AtReference[] = [{
      raw: '@file.md',
      path: 'file.md',
      startIndex: content.indexOf('@file.md'),
      endIndex: content.indexOf('@file.md') + '@file.md'.length,
      line: 5,
      column: 1,
    }];

    const contextMap = analyzeHeadingContext(content, references);

    const context = contextMap.get(references[0]!.startIndex);
    assert.ok(context);
    assert.strictEqual(context.contextLevel, 2); // Should use "Real Heading", not "Fake Heading"
  });

  it('handles empty reference list', () => {
    const content = '# Title\n## Section';

    const contextMap = analyzeHeadingContext(content, []);

    assert.strictEqual(contextMap.size, 0);
  });

  it('uses most recent heading when multiple precede reference', () => {
    const content = `# H1
## H2
### H3
@file.md`;

    const references: AtReference[] = [{
      raw: '@file.md',
      path: 'file.md',
      startIndex: content.indexOf('@file.md'),
      endIndex: content.indexOf('@file.md') + '@file.md'.length,
      line: 4,
      column: 1,
    }];

    const contextMap = analyzeHeadingContext(content, references);

    const context = contextMap.get(references[0]!.startIndex);
    assert.ok(context);
    assert.strictEqual(context.contextLevel, 3); // Most recent is h3
  });
});

describe('adjustHeadings with negative shift', () => {
  it('shifts headings up (decreasing level)', () => {
    const content = `### H3
#### H4
##### H5`;

    const adjusted = adjustHeadings(content, -2, false);

    assert.ok(adjusted.includes('# H3'));  // 3-2=1
    assert.ok(adjusted.includes('## H4')); // 4-2=2
    assert.ok(adjusted.includes('### H5')); // 5-2=3
  });

  it('clamps at h1 when shifting up too much', () => {
    const content = `## H2
### H3`;

    const adjusted = adjustHeadings(content, -5, false);

    assert.ok(adjusted.includes('# H2'));  // 2-5=-3 → clamped to 1
    assert.ok(adjusted.includes('# H3'));  // 3-5=-2 → clamped to 1
    assert.ok(!adjusted.includes('##'));   // No h2 or higher
  });

  it('warns when clamping at h1', () => {
    const content = '## H2';

    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => { warnCalled = true; };

    adjustHeadings(content, -5, true);

    console.warn = originalWarn;
    assert.strictEqual(warnCalled, true);
  });
});

describe('normalizeHeadings', () => {
  it('normalizes first heading to target level', () => {
    const content = `### Title
#### Section
##### Subsection`;

    const normalized = normalizeHeadings(content, 1, false);

    assert.ok(normalized.includes('# Title'));    // 3→1 (shift -2)
    assert.ok(normalized.includes('## Section')); // 4→2
    assert.ok(normalized.includes('### Subsection')); // 5→3
  });

  it('preserves relative heading hierarchy', () => {
    const content = `## Commander
#### Usage
### Chalk`;

    const normalized = normalizeHeadings(content, 2, false);

    // First heading is h2, target is h2, shift = 0
    assert.ok(normalized.includes('## Commander'));
    assert.ok(normalized.includes('#### Usage'));
    assert.ok(normalized.includes('### Chalk'));
  });

  it('returns unchanged when no headings', () => {
    const content = 'Plain text\nNo headings here';

    const normalized = normalizeHeadings(content, 3, false);

    assert.strictEqual(normalized, content);
  });

  it('normalizes h4 file to start at h2 (negative shift)', () => {
    const content = `#### Deep Level
##### Even Deeper`;

    const normalized = normalizeHeadings(content, 2, false);

    assert.ok(normalized.includes('## Deep Level'));   // 4→2 (shift -2)
    assert.ok(normalized.includes('### Even Deeper')); // 5→3
  });

  it('normalizes h1 file to start at h3 (positive shift)', () => {
    const content = `# Title
## Section`;

    const normalized = normalizeHeadings(content, 3, false);

    assert.ok(normalized.includes('### Title'));   // 1→3 (shift +2)
    assert.ok(normalized.includes('#### Section')); // 2→4
  });

  it('clamps at h6 when normalizing deep', () => {
    const content = `# Title
## Section`;

    const normalized = normalizeHeadings(content, 6, false);

    assert.ok(normalized.includes('###### Title'));   // 1→6 (shift +5)
    assert.ok(normalized.includes('###### Section')); // 2→7 → clamped to 6
    assert.ok(!normalized.includes('#######')); // No h7
  });

  it('clamps at h1 when normalizing shallow', () => {
    const content = `### Title
#### Section`;

    const normalized = normalizeHeadings(content, 1, false);

    assert.ok(normalized.includes('# Title'));   // 3→1 (shift -2)
    assert.ok(normalized.includes('## Section')); // 4→2
  });

  it('ignores headings in code blocks', () => {
    const content = `## Real Heading
\`\`\`markdown
# Fake Heading
\`\`\`
### Another Real`;

    const normalized = normalizeHeadings(content, 1, false);

    // First REAL heading is h2, target is h1, shift = -1
    assert.ok(normalized.includes('# Real Heading'));
    assert.ok(normalized.includes('# Fake Heading')); // Unchanged (in code block)
    assert.ok(normalized.includes('## Another Real'));
  });

  it('adjusts headings inside file blocks when skipFileBlocks is false', () => {
    const content = `## Title
<file path="test.md">

### Nested Heading

</file>`;

    const normalized = normalizeHeadings(content, 3, false, false);

    // First heading is h2, target is h3, shift = +1
    assert.ok(normalized.includes('### Title'));
    assert.ok(normalized.includes('#### Nested Heading')); // Also shifted
  });

  it('skips headings inside file blocks when skipFileBlocks is true', () => {
    const content = `## Title
<file path="test.md">

### Nested Heading

</file>`;

    const normalized = normalizeHeadings(content, 3, false, true);

    // First heading is h2, target is h3, shift = +1
    assert.ok(normalized.includes('### Title'));
    assert.ok(normalized.includes('### Nested Heading')); // NOT shifted (in file block)
  });
});
