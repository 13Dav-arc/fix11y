/**
 * Ephemeral Test Environment & Fixtures Harness.
 *
 * Provides isolated temporary scratch directories, file-backed test SQLite databases,
 * and deterministic HTML/Mustache template fixtures for end-to-end testing.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface EphemeralWorkspace {
  workspaceDir: string;
  dbPath: string;
  cleanup: () => void;
}

export const FIXTURES = {
  /**
   * Messy template with 3 clustered violations:
   * 1. div onclick non-semantic interactive element (ButtonSemanticsRule)
   * 2. div onclick non-semantic interactive element (ButtonSemanticsRule)
   * 3. input text missing label / aria-label (FormLabelRule)
   * Also contains Mustache template directives to verify 100% untouched bytes preservation.
   */
  MESSY_TEMPLATE: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Acme Storefront</title>
</head>
<body>
  {{#if user.isLoggedIn}}
    <!-- Header Landmark -->
    <header class="site-header">
      <div class="menu-cta" onclick="toggleMenu()">
        Toggle Navigation
      </div>
      <span>Welcome back, {{user.name}}!</span>
    </header>

    <!-- Main Content Area -->
    <main class="store-content">
      <h1>Featured Products</h1>
      <div class="checkout-cta" onclick="handleCheckout()">
        Complete Purchase
      </div>

      <section class="newsletter-signup">
        <h2>Subscribe</h2>
        <form id="subscribe-form">
          <input type="email" id="email-field" placeholder="you@example.com">
        </form>
      </section>
    </main>
  {{/if}}
</body>
</html>`,

  /**
   * Single-issue fixture: non-semantic clickable element.
   */
  SINGLE_ISSUE: `<section class="hero-banner">
  <div class="hero-action" onclick="claimOffer()">Claim Summer Offer</div>
  <p class="hero-caption">Exclusive summer deals for {{user.region}}.</p>
</section>`,

  /**
   * Multi-issue fixture with 4 violations for budget capping tests.
   */
  MULTI_ISSUE_BUDGET: `<div class="container">
  <div onclick="click1()">Action 1</div>
  <div onclick="click2()">Action 2</div>
  <div onclick="click3()">Action 3</div>
  <div onclick="click4()">Action 4</div>
</div>`,
};

/**
 * Creates an isolated ephemeral scratch workspace directory with a dedicated SQLite database.
 */
export function createEphemeralWorkspace(prefix = 'fix11y-e2e-'): EphemeralWorkspace {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const workspaceDir = path.join(os.tmpdir(), `${prefix}${uniqueId}`);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const dbPath = path.join(workspaceDir, '.checkpoints.db');

  const cleanup = () => {
    try {
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup locks on Windows
    }
  };

  return {
    workspaceDir,
    dbPath,
    cleanup,
  };
}

/**
 * Seeds fixture files into a workspace directory.
 */
export function seedWorkspaceFixtures(
  workspaceDir: string,
  files: Record<string, string>,
  targetDirectory = '.'
): void {
  const baseDir = path.resolve(workspaceDir, targetDirectory);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(baseDir, relativePath);
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }
}
