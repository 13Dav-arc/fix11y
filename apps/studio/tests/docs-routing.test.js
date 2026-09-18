import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Phase 4: Documentation Hub Architecture & Invariants', () => {
  const docsDir = fileURLToPath(new URL('../src/app/docs', import.meta.url));

  it('verifies that all documentation route files exist', () => {
    const requiredFiles = [
      'layout.jsx',
      'page.jsx',
      'getting-started/page.jsx',
      'core/page.jsx',
      'playground/page.jsx',
      'agent/page.jsx',
      'faq/page.jsx',
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.resolve(docsDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Documentation file must exist: ${relPath}`);
    }
  });

  describe('DocsLayout & Navigation Sidebar Architecture', () => {
    const layoutContent = fs.readFileSync(path.resolve(docsDir, 'layout.jsx'), 'utf8');

    it('exports DOC_SECTIONS containing all 5 documentation sections', () => {
      assert.match(layoutContent, /export const DOC_SECTIONS = \[/, 'Must export DOC_SECTIONS array');

      const expectedIds = ['getting-started', 'core', 'playground', 'agent', 'faq'];
      for (const id of expectedIds) {
        assert.ok(
          layoutContent.includes(`id: '${id}'`),
          `DOC_SECTIONS must define section: ${id}`
        );
      }
    });

    it('implements WCAG 2.2 AA accessible skip link and landmark navigation', () => {
      // Skip link for screen readers and keyboard navigation
      assert.match(
        layoutContent,
        /href="#docs-content"/,
        'Must provide skip-to-content link pointing to #docs-content'
      );
      assert.match(
        layoutContent,
        /Skip to main documentation content/,
        'Skip link must have descriptive accessible label'
      );

      // Navigation sidebar landmarks
      assert.match(
        layoutContent,
        /<nav\s+aria-label="Documentation sections"/,
        'Must provide navigation landmark with descriptive label'
      );
      assert.match(
        layoutContent,
        /<main\s+id="docs-content"/,
        'Must designate main content container with id="docs-content"'
      );
    });
  });

  describe('Route 1: /docs/getting-started (Part 0)', () => {
    const pageContent = fs.readFileSync(path.resolve(docsDir, 'getting-started/page.jsx'), 'utf8');

    it('faithfully represents honesty bounds and 3-pillar taxonomy from DOCS.md', () => {
      // Honest version up front
      assert.match(pageContent, /The Honest Version, Up Front/i, 'Must include honest bounds section');
      assert.match(pageContent, /human judgment/i, 'Must explain human judgment limitations');
      assert.match(pageContent, /mechanical part/i, 'Must explain mechanical checking scope');

      // 3 pillars table
      assert.match(pageContent, /The Three Pillars of fix11y/i, 'Must present the three pillars');
      assert.match(pageContent, /Core/);
      assert.match(pageContent, /Playground/);
      assert.match(pageContent, /Agent/);

      // Semantic structure
      assert.match(pageContent, /<article/, 'Must use semantic <article> container');
      assert.match(pageContent, /<table/, 'Must present pillars in accessible table');
    });
  });

  describe('Route 2: /docs/core (Part 1)', () => {
    const pageContent = fs.readFileSync(path.resolve(docsDir, 'core/page.jsx'), 'utf8');

    it('documents zero-dependency invariant, CST model, and WCAG rules catalog', () => {
      // Zero-dependency invariant
      assert.match(pageContent, /zero-dependency/i, 'Must highlight zero-dependency engine');

      // Invariant 2: CST Offset Patching
      assert.match(pageContent, /CST/i, 'Must document Concrete Syntax Tree patching');
      assert.match(pageContent, /Surgical CST Patching Architecture/i, 'Must state surgical patching architecture');

      // Built-in rule catalog
      assert.match(pageContent, /img-alt/);
      assert.match(pageContent, /form-label/);
      assert.match(pageContent, /button-semantics/);
      assert.match(pageContent, /aria-live-status/);

      // CLI command and flags
      assert.match(pageContent, /npx fix11y/);
      assert.match(pageContent, /--fix/);
      assert.match(pageContent, /--ci/);
      assert.match(pageContent, /--safety/);
    });
  });

  describe('Route 3: /docs/playground (Part 2)', () => {
    const pageContent = fs.readFileSync(path.resolve(docsDir, 'playground/page.jsx'), 'utf8');

    it('documents client-side browser isolation, Myers diffs, and playground boundary', () => {
      // In-browser execution invariant
      assert.match(pageContent, /Client-Side Execution|in your browser/i, 'Must document in-browser execution');
      assert.match(pageContent, /Nothing you paste into the editor is ever transmitted/i, 'Must guarantee zero server leakage');

      // Myers diff algorithm
      assert.match(pageContent, /Myers/i, 'Must describe Myers diff viewer');

      // Playground vs Agent boundary
      assert.match(pageContent, /The Boundary: Playground vs\. Agent/i, 'Must explain boundary between Playground and Agent');
    });
  });

  describe('Route 4: /docs/agent (Part 3)', () => {
    const pageContent = fs.readFileSync(path.resolve(docsDir, 'agent/page.jsx'), 'utf8');

    it('documents 3-job Actions DAG, public vs private routing, and safety tiers', () => {
      // 3-job DAG pipeline
      assert.match(pageContent, /3-Job Verification Pipeline \(DAG\)/i, 'Must document 3-job DAG');
      assert.match(pageContent, /Job 1[\s\S]*?patch/i, 'Must document Job 1 patch step');
      assert.match(pageContent, /Job 2[\s\S]*?verify/i, 'Must document Job 2 verify step');
      assert.match(pageContent, /Job 3[\s\S]*?resolve/i, 'Must document Job 3 resolve step');

      // Public vs Private repository routing
      assert.match(pageContent, /Public Repositories/i, 'Must document public repo shared runner');
      assert.match(pageContent, /Private Repositories/i, 'Must document private repo native workflow');

      // Safety tiers in pull requests
      assert.match(pageContent, /Safe Tier/i, 'Must document safe tier');
      assert.match(pageContent, /Caution Tier/i, 'Must document caution tier');

      // Build failure rejection guarantee
      assert.match(pageContent, /Broken Build Protection Guarantee/i, 'Must document broken build protection');
      assert.match(pageContent, /strictly refuses to open a pull request/i, 'Must state refusal on build failure');
    });
  });

  describe('Route 5: /docs/faq (Part 4)', () => {
    const pageContent = fs.readFileSync(path.resolve(docsDir, 'faq/page.jsx'), 'utf8');

    it('answers mechanical bounds, private code safety, pricing, and custom rules', () => {
      // 4 FAQs from DOCS.md
      assert.match(pageContent, /Does fix11y catch every accessibility problem/i, 'FAQ 1: Catch every problem');
      assert.match(pageContent, /Does fix11y see my private code/i, 'FAQ 2: Private code safety');
      assert.match(pageContent, /Is fix11y free to use/i, 'FAQ 3: Free beta pricing');
      assert.match(pageContent, /Can I write my own rules/i, 'FAQ 4: Custom rules');

      // Privacy answers
      assert.match(pageContent, /Never for private repositories/i, 'Must state private repo protection');
      assert.match(pageContent, /free during the public beta/i, 'Must state beta status');
    });
  });
});
