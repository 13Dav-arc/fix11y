import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

describe('Phase 5 — Milestone 5.5: Automated Accessibility DOM Audit (WCAG 2.2 AA Dogfooding)', () => {
  const appBuildDir = fileURLToPath(new URL('../.next/server/app', import.meta.url));

  before(() => {
    if (!fs.existsSync(appBuildDir)) {
      console.log('[INFO] Prerendered HTML not found at ' + appBuildDir + ' — executing next build...');
      const studioDir = fileURLToPath(new URL('..', import.meta.url));
      execSync('npx next build', { cwd: studioDir, stdio: 'inherit' });
    }
  });

  const routesToAudit = [
    { name: 'Root / Playground (/)', file: 'index.html' },
    { name: 'Autonomous Agent (/agent)', file: 'agent.html' },
    { name: 'Documentation Hub (/docs)', file: 'docs.html' },
    { name: 'Getting Started Guide (/docs/getting-started)', file: path.join('docs', 'getting-started.html') },
    { name: 'Core Engine Reference (/docs/core)', file: path.join('docs', 'core.html') },
    { name: 'Playground Guide (/docs/playground)', file: path.join('docs', 'playground.html') },
    { name: 'Agent Guide (/docs/agent)', file: path.join('docs', 'agent.html') },
    { name: 'FAQ & Architecture (/docs/faq)', file: path.join('docs', 'faq.html') },
    { name: 'Not Found Page (/404)', file: '_not-found.html' },
  ];

  for (const route of routesToAudit) {
    it(`audits route ${route.name} with axe-core for 0 WCAG 2.2 AA violations`, async () => {
      const filePath = path.join(appBuildDir, route.file);
      assert.ok(fs.existsSync(filePath), `Prerendered HTML must exist for ${route.name} at ${filePath}`);

      const html = fs.readFileSync(filePath, 'utf8');
      const dom = new JSDOM(html, {
        runScripts: 'outside-only',
      });

      const axeResults = await axe.run(dom.window.document.documentElement, {
        rules: {
          // Color contrast calculation requires a layout engine (Chromium/WebKit); disabled in JSDOM
          'color-contrast': { enabled: false },
        },
      });

      if (axeResults.violations.length > 0) {
        const errorSummary = axeResults.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => n.html),
        }));
        assert.fail(
          `Found ${axeResults.violations.length} accessibility violation(s) on ${route.name}:\n${JSON.stringify(errorSummary, null, 2)}`
        );
      }

      assert.equal(axeResults.violations.length, 0);
    });
  }

  it('audits active mobile navigation drawer modal in open state for 0 WCAG 2.2 AA violations', async () => {
    const indexPath = path.join(appBuildDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Simulate open mobile drawer modal state
    const drawerHtml = `
      <div class="fixed inset-0 z-50 md:hidden flex justify-end" id="drawer-wrapper">
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true"></div>
        <div
          id="mobile-navigation-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          tabindex="-1"
          class="relative w-72 max-w-[80vw] h-full bg-card border-l border-border p-5 flex flex-col gap-6 shadow-2xl z-10"
        >
          <div class="flex items-center justify-between border-b border-border/70 pb-4">
            <span class="text-sm font-bold text-white tracking-tight">Navigation Menu</span>
            <button
              id="drawer-close-btn"
              aria-label="Close navigation menu"
              class="p-1.5 rounded-lg text-muted hover:text-white hover:bg-cardHover focus-visible:ring-2 focus-visible:ring-accent outline-none"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <nav aria-label="Mobile Navigation Links" class="flex flex-col gap-1.5">
            <a href="/" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
              <span>Playground</span>
            </a>
            <a href="/agent" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:text-white hover:bg-cardHover">
              <span>Autonomous Agent</span>
            </a>
            <a href="/docs" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted hover:text-white hover:bg-cardHover">
              <span>Documentation Hub</span>
            </a>
          </nav>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHtml);

    const axeResults = await axe.run(document.documentElement, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });

    if (axeResults.violations.length > 0) {
      const errorSummary = axeResults.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => n.html),
      }));
      assert.fail(
        `Found ${axeResults.violations.length} accessibility violation(s) in mobile drawer modal:\n${JSON.stringify(errorSummary, null, 2)}`
      );
    }

    assert.equal(axeResults.violations.length, 0);
  });
});
