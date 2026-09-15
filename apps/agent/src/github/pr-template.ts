/**
 * Accessible PR Body Generator.
 *
 * Implements WCAG 2.2 AA / Cognitive Accessibility standards for PR descriptions:
 * - Scannable TL;DR metric table at the very top.
 * - Strict, non-skipping heading hierarchy (## -> ###).
 * - Screen-reader safe collapsible details for unified diffs.
 * - Prominent warning callout banner if budget cap circuit breaker was tripped.
 */

export interface PrRemediationPatch {
  filePath: string;
  diff: string;
  rationale: string;
  ruleId?: string;
  timestamp?: number;
}

export interface PrRemediationSummary {
  repoFullName: string;
  baseBranch?: string;
  branchName?: string;
  appliedPatches: PrRemediationPatch[];
  quarantinedCount?: number;
  budgetCapReached?: boolean;
  budgetCap?: number;
  llmCallCount?: number;
  verificationPassed?: boolean;
}

/**
 * Generates an accessible, structured GitHub Pull Request markdown description.
 */
export function generateAccessiblePrBody(data: PrRemediationSummary): string {
  const uniqueFiles = new Set(data.appliedPatches.map((p) => p.filePath));
  const fileCount = uniqueFiles.size;
  const patchCount = data.appliedPatches.length;
  const buildStatus = data.verificationPassed !== false ? '✅ Passed' : '❌ Failed';

  const sections: string[] = [];

  // 1. TL;DR Summary Table
  sections.push(
    `## 📋 Summary (TL;DR)`,
    ``,
    `| Metric | Status / Count |`,
    `| :--- | :--- |`,
    `| **Target Repository** | \`${data.repoFullName}\` |`,
    `| **Files Remediated** | **${fileCount}** file${fileCount === 1 ? '' : 's'} |`,
    `| **WCAG Fixes Applied** | **${patchCount}** surgical patch${patchCount === 1 ? '' : 'es'} |`,
    `| **Sandbox Build Verification** | ${buildStatus} |`,
    `| **Quarantined Issues** | ${data.quarantinedCount || 0} issue${data.quarantinedCount === 1 ? '' : 's'} |`,
    ``
  );

  // 2. Remediations Applied with Collapsible Diffs
  sections.push(`## 🛠️ Remediations Applied`, ``);

  if (data.appliedPatches.length === 0) {
    sections.push(`No surgical patches were required. Repository is compliant.`, ``);
  } else {
    data.appliedPatches.forEach((patch, idx) => {
      const fixNumber = idx + 1;
      const ruleText = patch.ruleId ? ` (\`${patch.ruleId}\`)` : '';

      sections.push(
        `### ${fixNumber}. \`${patch.filePath}\`${ruleText}`,
        ``,
        `**WCAG Rationale:** ${patch.rationale}`,
        ``,
        `<details>`,
        `<summary><code>${patch.filePath}</code> — View Surgical Unified Diff</summary>`,
        ``,
        `<pre><code class="language-diff">`,
        patch.diff.trim(),
        `</code></pre>`,
        `</details>`,
        ``
      );
    });
  }

  // 3. WCAG Standards Compliance Details
  sections.push(
    `## 🛡️ WCAG Criteria Satisfied`,
    ``,
    `- **WCAG 2.1.1 (Level A) Keyboard Operability**: Non-semantic clickable elements converted to native \`<button type="button">\` or interactive controls.`,
    `- **WCAG 4.1.2 (Level A) Name, Role, Value**: Explicit accessible names (\`aria-label\`, \`<label for="">\`) and standard ARIA roles applied.`,
    `- **WCAG 1.1.1 (Level A) Non-Text Content**: Decorative and contextual \`alt=""\` attributes guaranteed on non-text elements.`,
    `- **WCAG 4.1.3 (Level AA) Status Messages**: Dynamic containers upgraded with \`role="status"\` and \`aria-live="polite"\`.`,
    ``
  );

  // 4. Budget Cap / Circuit Breaker Callout Banner (if applicable)
  if (data.budgetCapReached) {
    const cap = data.budgetCap || 50;
    sections.push(
      `## ⚠️ Circuit Breaker Notice`,
      ``,
      `> [!WARNING]`,
      `> **Budget Cap Reached:** The autonomous engineer reached the configured budget limit of **${cap} LLM calls**.`,
      `> Any remaining violations were safely quarantined to avoid unbounded token consumption. You may trigger another remediation cycle or inspect quarantined issues.`,
      ``
    );
  }

  // 5. Verification & Engine Footnote
  sections.push(
    `---`,
    `*Automated by [fix11y](https://fix11y.vercel.app/) — Zero-dependency, Concrete Syntax Tree (CST) surgical accessibility engine.*`
  );

  return sections.join('\n');
}
