# fix11y — Platform Architecture (Revised v2.2)

**Status:** Supersedes `ARCHITECTURE_PLAN.md` (v1), `ARCHITECTURE.md` (v1.1), and `ARCHITECTURE.md` (v2.1).
**What changed in v2:** four architectural risks were identified and folded in — (1) secret-exfiltration risk in the build-verification step, closed via job-level isolation rather than deleting verification outright; (2) the public/unlimited-minutes fix for the Actions quota is now scoped to public target repos only, since routing a private repo through a public log was a confidentiality bug, not a solved problem; (3) run-discovery for terminal-initiated pushes is now handled via a GitHub Check Run, not an assumption that the browser already has the `runId`; (4) document-level rules (`heading-order`, `landmark-one-main`) are moved out of the Agent's per-file scan, since the parser has no cross-file/partial-composition step and would produce false positives on template fragments.
**What changed in v2.1:** added a manual "Run Agent now" trigger from Studio (§2.7), alongside the push-triggered webhook, plus an explicit statement of the boundary between what Studio's Playground can preview (rule output on pasted code, via `@fix11y/core` directly) and what only the Agent can do (clone, build-verify, and PR against a real repo) — see §3.1.
**What changed in v2.2 (this revision):** four platform refinements adopted — (1) Agent workflow split into a 3-job DAG (`patch` -> `verify` -> `resolve`), formally granting PR creation authority to `resolve` post-verification while keeping `verify` completely unprivileged (§2.5); (2) added explicit `provisioning_runner` stage to Upstash and Check Run progress tracking to cover the 30–75s Actions runner cold-start without an apparent UI stall (§7.1, §7.2); (3) confirmed stateless Upstash KV + TTL over SQLite checkpointer (§2.4); (4) private-repo delivery model finalized using native auto-injected `GITHUB_TOKEN` for PRs in `resolve`, opt-in user-supplied `GEMINI_API_KEY` (pure deterministic `@fix11y/core` rules if absent), delivered via an initial PR installing a reusable composite action (`uses: fix11y/fix11y-action@v1`) with transparent `workflows` permission disclosure (§2.6, §9.3).

---

## 0. Design Principles

1. **Never claim more coverage than the engine has.** No automated tool — this one included — can mechanically resolve all of WCAG. Copy and PR text describe *what was actually checked*, not "accessibility, fixed."
2. **Every fix teaches something.** Each diagnostic carries a plain-language explanation and a WCAG criterion reference, not just a patch.
3. **Cost-free by construction, not by hoping usage stays low.** Every managed service is chosen because its free tier is either permanent or comfortably absorbs beta-scale traffic.
4. **The safety tier (`safe` / `caution`) is always visible.** CLI output, Studio diff view, and PR bodies all surface it.
5. **Nothing hides the source of truth.** The custom progress UI in Studio is a friendly layer on top of GitHub's own Actions log and Check Runs — never a replacement for them.
6. **Verification is never deleted to solve a security problem — it's isolated.** *(new)* A safety net removed to close an attack surface just reopens a different failure mode (broken, unverified PRs). The fix is always to isolate the risky step, not remove it.
7. **A rule only runs where its assumptions hold.** *(new)* Document-level rules that assume a fully composed page do not run against isolated template fragments. Scope, don't guess.

---

## 1. Product Strategy — Three Pillars, Two Audiences

| Pillar | Route | Job for a beginner | Job for an experienced dev |
|---|---|---|---|
| **Fix11y Agent** | `/agent` | See real fixes land as real PRs — learn by reading diffs on their own repo; can also click "Run Agent now" (§2.7) instead of pushing a throwaway commit | CI-grade autonomous remediation with a visible, auditable run per commit, plus on-demand re-runs |
| **Fix11y Studio** | `/playground` | Paste code, get an inline explanation of *why* each fix matters (WCAG criterion + plain-language reason) | Fast iteration loop; inspect exactly which rule fired and its safety tier before deciding to ship a fix |
| **Fix11y Core (docs)** | `/docs` | CLI quick start + a "how a rule actually works" walkthrough using real source as the example | API reference, contribution guide, and the extension point for writing new rules |

**Honest scope statement (landing page + `/agent`):**
> "fix11y automatically fixes the accessibility issues that can be fixed automatically — missing image descriptions, unlabeled form fields, non-semantic buttons, and a growing list of others. It flags everything else for human review. No automated tool can resolve 100% of WCAG on its own, and we won't tell you otherwise."

---

## 2. End-to-End System Architecture (Cost-Free Pipeline)

### 2.1 What changed and why (cumulative — v1.1 + this revision)

| Component | Problem found | Resolution | Why it holds up |
|---|---|---|---|
| Render background worker | Render's free plan does **not** include background workers (~$7/mo min) | **GitHub Actions**, run inside a fix11y-owned control repo (`fix11y-runner`) | Cost sits on fix11y's account, not the end user's |
| Upstash Redis as a queue | Unnecessary once Actions replaces the persistent worker | **`repository_dispatch`** | Free, built into GitHub |
| E2B microVM sandbox | Free tier is real but the $100 credit depletes under real usage | GitHub Actions' own runner provides process isolation | No separate sandbox purchase for the beta |
| **`npm test` sharing a runner with secrets** *(refined in v2.2)* | A malicious `postinstall` script in the target repo can read any secret present in that job's environment — including the GitHub App private key and Gemini key. Furthermore, an unprivileged verify job cannot open PRs. | **Split into a three-job DAG** (see §2.5): a `patch` job holds secrets and never runs target scripts; a `verify` job runs `npm ci --ignore-scripts && npm test` on a fresh runner with **zero secrets declared**; a `resolve` job executes post-verification with PR authority to open the pull request only if tests pass. | Verification is preserved; secrets are never present on the execution runner; PR authority is cleanly isolated and gated on verification passing. |
| **"Make the control repo public for unlimited minutes"** *(refined in v2.2)* | Public repo = public logs. A private target repo's source, diagnostics, and diffs would become world-readable mid-run — a confidentiality breach. | **Branch by target-repo visibility** (see §2.6). Public targets run on shared `fix11y-runner`. Private targets run directly inside the user's repo using their native `GITHUB_TOKEN`, opt-in `GEMINI_API_KEY`, and a reusable composite action (`fix11y/fix11y-action@v1`) installed via an initial setup PR. | Public repos use free shared minutes safely; private repos preserve confidentiality completely, avoid holding central keys, and remain 100% transparent. |
| **Browser never learns the `runId` for a terminal-initiated push** | The Vercel webhook mints the `runId` in the background; nothing tells the developer's browser about it if they never opened Studio to trigger the run | **GitHub Check Run**, created immediately on the commit, linking to `fix11y.vercel.app/agent?runId=<uuid>`, and updated in place as the run progresses | The commit/PR itself is where a developer naturally looks after a push — no separate discovery mechanism needed |
| **Actions runner VM provisioning latency (30–75s)** *(new in v2.2)* | After `repository_dispatch`, GitHub Actions takes 30–75 seconds to spin up a runner VM; without an explicit stage, the run appears stalled in `queued`. | **Explicit `provisioning_runner` stage** (see §7.1, §7.2) written to Upstash and Check Run immediately by Vercel upon dispatch. | Immediate user feedback; eliminates perceived UI freezes during runner cold-start. |
| **Document-level rules on template fragments** | `core` parses one file at a time with no cross-file partial resolution; `heading-order`/`landmark-one-main` will false-positive if `<main>` opens in `header.hbs` and closes in `footer.hbs` | **Rule scoping split** (see §6): those two rules move to a Studio-only, full-document ruleset; the Agent's per-file scan keeps only element-local rules | Rules only run where their single-file assumption is actually true |
| — | Needed live in-app progress | Upstash Redis, repurposed as a small KV progress store over REST | Permanent free tier: 500K commands/month, 256MB |
| Gemini (paid assumption) | Free tier real but rate-limited; free-tier input may be used by Google to improve products | Gemini free tier, budget-capped, with bring-your-own-key option | Default path costs nothing |

### 2.2 Full pipeline diagram (revised)

```
┌─────────────┐      push       ┌──────────────────┐
│ User's repo │ ───────────────▶│  GitHub webhook   │
└─────────────┘                 └─────────┬─────────┘
                                           │ POST
                                           ▼
                  ┌───────────────────────────────────────────┐
                  │ Vercel: /api/webhooks/github                 │
                  │  1. Verify HMAC-SHA256 signature             │
                  │  2. Generate unguessable runId                │
                  │  3. Seed Upstash progress record (queued)     │
                  │  4. Check target repo visibility (public/priv)│
                  │  5. Create a GitHub Check Run on commit SHA   │
                  │  6. Dispatch runner & immediately transition  │
                  │     Upstash & Check Run to provisioning_runner│
                  └───────────────────┬───────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼ target repo is PUBLIC              ▼ target repo is PRIVATE
       repository_dispatch to the SHARED,        Workflow lives IN the user's repo
       public fix11y-runner control repo          (installed via initial setup PR —
       (unlimited free Actions minutes,           uses THEIR private-repo minutes;
        logs are public, target repo is too)       native GITHUB_TOKEN, opt-in Gemini.
                    │                             No shared runner involved at all)
                    │                                         │
                    ▼                                         ▼
     ┌─────────────────────────────────────────────────────────────┐
     │  Actions workflow — THREE-JOB DAG, strictly isolated        │
     │                                                             │
     │  JOB 1: "patch"  (has GITHUB_APP_PRIVATE_KEY or GITHUB_TOKEN│
     │   + optional GEMINI_API_KEY in scope)                       │
     │   init_sandbox → initial_audit → atomic_file_fix             │
     │   (clone repo; safe-rule patches via core's CST patcher,    │
     │    or Gemini-proposed patches constrained to CST offsets;   │
     │    NEVER runs the target repo's own scripts)                │
     │   → uploads patched checkout & patch manifest as artifact    │
     │                     │                                       │
     │                     ▼ needs: patch                          │
     │  JOB 2: "verify"  (fresh runner, ZERO secrets declared)     │
     │   downloads artifact → npm ci --ignore-scripts → npm test   │
     │   (step-security/harden-runner egress filtering active)     │
     │   → records test exit status & log excerpt as artifact      │
     │                     │                                       │
     │                     ▼ needs: [patch, verify]                │
     │  JOB 3: "resolve"  (has repo credentials in scope)          │
     │   downloads patch & verification artifacts:                 │
     │   • If verify SUCCEEDED: pushes branch, opens/updates PR,   │
     │     sets Check Run conclusion: success, updates Upstash     │
     │   • If verify FAILED: opens NO PR, marks Check Run          │
     │     conclusion: failure, updates Upstash with build error   │
     └─────────────────────────────┬───────────────────────────────┘
                                   │ writes progress at each step
                                   ▼
                       ┌──────────────────────┐
                       │  Upstash Redis &     │
                       │  GitHub Check Run    │
                       └──────────────────────┘

  ───────────────────────── in parallel, live in two places ─────────────────────────

  1. GitHub itself: the Check Run on the commit/PR shows a live-updating
     one-line summary + a "Details" link — visible with zero extra code.

  2. Studio (/agent), if the developer opens it (via the Check Run link,
     or because they triggered the run from Studio directly):
       │  polls GET /api/agent/status?runId=xxx  every 2-3s
       ▼
  Vercel: /api/agent/status
       │  reads Upstash (never exposes the Upstash token to the browser)
       ▼
  Progress panel renders: 6-stage stepper (provisioning, sandbox, audit,
  patch, verify, resolve/PR), per-file counter, aria-live announcements
  on stage change (throttled to stage transitions, not per-file), link
  to the full GH Actions log, explicit failed/timeout states
```

### 2.3 Responsibility summary

1. **Trigger** — push/PR event on a repo with the fix11y GitHub App installed (or manual "Run Agent now" button).
2. **Ingestion (Vercel)** — verify signature, mint `runId`, seed Upstash record, check target repo visibility, create a Check Run on commit SHA, dispatch runner, and immediately update Upstash and the Check Run to `provisioning_runner`.
3. **Processing** — three isolated Actions jobs (§2.5): `patch` (has secrets, runs `@fix11y/core` and Gemini, never executes target-repo scripts), `verify` (fresh runner, zero secrets, executes build/test), and `resolve` (receives artifacts, evaluates test outcome, updates Check Run/Upstash, and gates PR creation).
4. **AI-assisted patching** — Gemini free tier by default on public runner (or user-supplied `GEMINI_API_KEY` on private repos). If unset, strictly executes deterministic `@fix11y/core` rules. All patches constrained to character-offset CST schema.
5. **Resolution** — Job 3 (`resolve`) evaluates verification: if tests pass, Octokit pushes the branch and opens the PR, marking Check Run `conclusion: success`. If tests fail, it marks Check Run `conclusion: failure`, writes failure logs to Upstash, and opens no PR.
6. **Live status** — visible natively on GitHub via Check Run, and optionally in Studio's richer panel (6-stage stepper backed by Upstash via `/api/agent/status`).

### 2.4 Known trade-off, stated plainly
Dropping the SQLite-checkpoint design (originally paired with a persistent Render worker) means a crashed run does not auto-resume — it fails and can be manually re-triggered. Upstash KV + TTL provides clean stateless progress tracking with zero maintenance. Accepted for the beta.

### 2.5 Security hardening — three-job secret isolation & gated resolution *(refined in v2.2)*

The risk: running `npm test` (or any target-repo script) on a runner that also holds credentials gives a malicious `postinstall` script a path to exfiltrate them. But an unprivileged runner has no authority to open pull requests. GitHub Actions jobs run on fresh, isolated VMs by default, and secrets are only present in a job if that job's YAML explicitly references them — so the pipeline is organized as a three-job DAG:

- **`patch` job:** declares secrets (`GITHUB_APP_PRIVATE_KEY` or repository token, optional `GEMINI_API_KEY`), clones the target repo, runs `@fix11y/core`'s audit and patch logic, and uploads the patched checkout as a workflow artifact. **Never invokes any script that ships with the target repo** (no `npm install` with lifecycle scripts, no `npm test`) — it only reads/writes files directly.
- **`verify` job (`needs: patch`):** a separate job in the same workflow, **declares no secrets at all**. Downloads the artifact, runs `npm ci --ignore-scripts && npm test`. If a malicious `postinstall` fires here, there is nothing on that runner worth stealing. Monitored by [`step-security/harden-runner`](https://github.com/step-security/harden-runner) to detect and block abnormal outbound traffic. Emits verification status and test log excerpt as an artifact.
- **`resolve` job (`needs: [patch, verify]`):** runs only after `verify` completes, declaring repository credentials:
  - **If `verify` succeeded:** pushes the remediated branch, opens/updates the pull request via Octokit, marks the Check Run `conclusion: success` with diff summary, and records success in Upstash.
  - **If `verify` failed:** marks the Check Run `conclusion: failure`, writes the failure log excerpt to Upstash, and **opens NO pull request**.

This preserves the build-verification safety net while ensuring zero secrets are exposed to untrusted code, and cleanly breaks the authority deadlock by gating PR creation on build success.

### 2.6 Public vs. private target repos — native GITHUB_TOKEN, opt-in AI, PR delivery *(refined in v2.2)*

- **Target repo is public →** route through the shared `fix11y-runner` control repo, which is itself public (unlimited free Actions minutes). No confidentiality issue, because the repo's contents and logs are already public.
- **Target repo is private →** do **not** route it through the shared public runner. Instead, fix11y runs directly inside the *user's own* private repo:
  - **Native auto-injected `GITHUB_TOKEN`:** The workflow uses GitHub's built-in token (`permissions: { contents: write, pull-requests: write, checks: write }`) to push branches and open pull requests in the `resolve` job. No central GitHub App private key is required or exposed on the private runner.
  - **Opt-in Generative AI:** The workflow references `secrets.GEMINI_API_KEY`. If the user configures this secret in their repository, Gemini assists with semantic fixes. If absent, the workflow executes pure deterministic `@fix11y/core` rules (alt text placeholders, form label associations, button semantics, ARIA live) without failure.
  - **Delivery via Setup PR & Reusable Composite Action:** Rather than silently writing workflow files to the default branch (which requires broad, sensitive `workflows` permissions), fix11y opens an initial pull request: `fix11y: add automated accessibility remediation workflow`. This PR adds `.github/workflows/fix11y.yml` referencing a versioned, reusable composite action: `uses: fix11y/fix11y-action@v1`. The repository owner reviews and merges the workflow themselves, ensuring total auditability. The GitHub App transparently discloses that it requests `workflows` permission solely to submit this initial pull request.

This is a capacity, confidentiality, and security fix at once: it removes private-repo traffic from fix11y's shared quota entirely, keeps all source code and logs inside the user's boundary, and gives the repository owner explicit veto power over workflow installation.

### 2.7 Manual trigger from Studio *(new — addendum)*

The pipeline in §2.2 is described as push-triggered, but a `git push` isn't the only reasonable way to start a run. `/agent` in Studio gets a **"Run Agent now"** action for any repo the user has already installed the GitHub App on:

```
User clicks "Run Agent now" on /agent
        │
        ▼
POST /api/agent/trigger  { repo, sha? }   (Vercel)
        │  Does exactly what the webhook handler does in §2.2 steps 1-6:
        │  verify the request is from an authenticated, installed user →
        │  mint runId → seed Upstash → check repo visibility →
        │  create Check Run on commit → transition to provisioning_runner →
        │  dispatch runner per §2.6 → return runId to browser immediately
        ▼
Same downstream pipeline as a push-triggered run — patch job, verify job,
resolve job, Check Run updates, Upstash updates, PR opened on success.
```

The only real difference from the webhook path: **the browser already has the `runId`**, since it made the request itself — so Studio can open the progress panel immediately, without needing the Check Run round-trip that a terminal-initiated push relies on (§7.1 still fires regardless, since GitHub doesn't know which path started the run).

**Why this is worth adding, not just a nice-to-have:** it lets someone re-run the Agent on demand — after merging something manually, after fixing a build failure the `verify` job caught, or just to see it work without staging a throwaway commit — without inventing a second pipeline. It's the same three-job DAG, the same public/private routing, the same progress surfaces; only the *first* step (how the run gets started) differs.

**What it does not change:** the Agent still requires a real, installed, cloneable repo to do anything — see §3.1 for why this can't extend to arbitrary pasted code in Playground.

---

## 3. Component Interaction Map (Core / Studio / Agent)

### 3.1 The boundary between Playground and Agent *(new — addendum)*

Both surfaces run `@fix11y/core`, which invites the question of why Playground can't just "run the Agent" on whatever's pasted into it. It can't, because three of the Agent's five pipeline stages have no meaning without a real repo:

| Stage | Needs | Why pasted code can't supply it |
|---|---|---|
| `init_sandbox` | A cloneable repo, via the GitHub App install token | Nothing to clone — there's no repo behind a textarea |
| `verify_build` | A real `package.json`, installed dependencies, a real project structure | A pasted snippet has no build to run |
| `open_pr` | A real branch to open a pull request against | A PR is inherently repo-to-repo; there's no target for one here |

So the division of labor is intentional, not a missing feature:
- **Playground** = preview. Same rule engine, same patcher, same metadata (WCAG criterion, plain-language explanation, safety tier) — but the output is "here's what this rule would do," ending at a diff the user copies out by hand.
- **Agent** = proof + delivery. The same rules run inside a real clone, the fix is verified against a real build in the isolated `verify` job, and the `resolve` job ships the result as a real, reviewable PR (§2.5).

Playground is where someone learns what a rule does; the Agent is where that same rule's fix gets proven and shipped. Neither one is a lesser version of the other — they answer different questions.

```
┌────────────────┐
│  @fix11y/core   │  zero-dependency rule engine + CST parser/patcher
│  (packages/core)│  (per-file only — no cross-file/partial composition step)
└───────┬─────┬───┘
        │     │
   imported   imported
   client-side│    server-side (inside Actions "patch" job)
        │     │
        ▼     ▼
┌────────────────┐        ┌───────────────────────────────────────┐
│  Fix11y Studio  │        │  Fix11y Agent — 3-Job Actions DAG     │
│  (apps/studio)   │        │  (fix11y-runner OR user repo, §2.6)   │
│                  │        │                                       │
│  - Playground UI │        │  1. JOB "patch" (has credentials)     │
│    runs core     │        │     - initial_audit via core          │
│    fully client- │        │     - atomic_file_fix (core/Gemini    │
│    side, free    │        │       character-offset CST patches)   │
│  - Document-level│        │     - NEVER runs target repo scripts  │
│    rules (heading-        │       uploads patched artifact        │
│    order, landmark-       │                  │                    │
│    one-main) run │        │                  ▼ needs: patch       │
│    HERE ONLY on  │        │  2. JOB "verify" (ZERO secrets)       │
│    pasted docs   │        │     - downloads artifact              │
│  - Progress panel│        │     - npm ci --ignore-scripts         │
│    polls Vercel  │        │     - npm test (harden-runner egress) │
│    status API    │        │                  │                    │
│  - Educational   │        │                  ▼ needs: [p, v]      │
│    "explain this"│◀───────│  3. JOB "resolve" (repo credentials)  │
│    metadata      │   PR   │     - evaluates test outcome          │
│                  │  link  │     - opens PR ONLY if tests pass     │
└──────────────────┘        └──────────────────┬────────────────────┘
                                               │ writes progress
                                               ▼
                                     ┌──────────────────┐
                                     │  Upstash Redis & │
                                     │  GitHub Checks   │
                                     └──────────────────┘
                                               ▲
                                               │ reads (server-side only)
                                     ┌──────────────────────┐
                                     │  Vercel: /api/agent/ │
                                     │  status (proxy)      │
                                     └──────────────────────┘
```

**The one shared contract across all three:** every patch — from a deterministic rule in `core`, applied live in Studio, or proposed by Gemini inside the Agent's `patch` job — is expressed as the same character-offset patch object and applied by the same `applyPatches` function. This is *the* reason the system can let an LLM touch code autonomously without it being able to silently corrupt a file.

---

## 4. Next.js App Router Structure

```
apps/studio/app/
├── layout.tsx                  # Global root layout: Navbar, Footer, ThemeProvider
├── page.tsx                    # Unified landing page (hero, pipeline diagram, honest scope statement, 3 pillar CTAs)
├── globals.css                 # Tailwind base + design tokens
├── playground/
│   └── page.tsx                 # Studio interface: paste code → live patch → "explain this fix" → document-level rules (§6)
├── agent/
│   └── page.tsx                 # Install CTA + live progress panel, reachable via Check Run link or direct visit
├── docs/
│   └── [...slug]/
│       └── page.tsx              # MDX docs: CLI guide, rule-writing walkthrough, API reference
└── api/
    ├── webhooks/
    │   └── github/
    │       └── route.ts          # HMAC verify, mint runId, seed Upstash, check repo visibility, create Check Run, route per §2.6
    └── agent/
        ├── status/
        │   └── route.ts          # GET ?runId=xxx → reads Upstash, returns progress JSON (read-only proxy)
        └── trigger/
            └── route.ts          # POST { repo, sha? } → same seeding/routing as the webhook handler, for the "Run Agent now" button (§2.7)
```

**Note on `apps/agent`:** becomes the workflow code (LangGraph nodes, patch/verify job logic) invoked either by the shared `fix11y-runner` repo (public targets) or by a copy installed into the user's own repo (private targets) — never a persistent hosted service.

---

## 5. Visual Design System & UX Requirements *(preserved unchanged, as originally specified)*

### 5.1 Responsive foundation
Tailwind breakpoints (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) applied across the shared layout, landing page, and the playground's editor panes — with particular care on the editor panes collapsing from side-by-side to stacked on mobile.

### 5.2 Visual language
Refined border radii (`rounded-xl`, `rounded-2xl`) on cards, buttons, and editor panes. Layered, soft box-shadows for depth (`shadow-sm` at rest, `shadow-lg` on hover/focus) — restrained, not skeuomorphic.

### 5.3 Theming
`next-themes` for system-aware light/dark mode. Persist explicit user overrides to `localStorage`; default to `prefers-color-scheme` when no override is set. All color tokens as CSS variables in `globals.css`, shared by the marketing shell and the `DiagnosticList` severity badges.

### 5.4 Iconography & branding
All icons sourced from [icones.js.org](https://icones.js.org/), preferring Lucide or Phosphor. Logo/SVGs refined for high-DPI rendering, shipped as `viewBox`-based SVG.

### 5.5 Accessibility (dogfooding — non-negotiable)
Full ARIA landmark structure on every route. Logical focus order and focus trapping in any modal. Visible `focus-visible:ring` on every interactive element. Minimum 4.5:1 contrast in both themes, verified for the *new* palette. The `Announcer` component's `aria-live="polite"` region, extended to the new Agent progress panel — throttled to stage changes, not per-file noise.

---

## 6. Core Rule Catalog — Expansion Plan (revised scoping)

All rules follow the existing `BaseRule` pattern, remain zero-dependency, and each carries:
```js
{
  wcagCriterion: "1.1.1",
  plainLanguage: "Images without alt text are invisible to screen reader users.",
  safetyTier: "safe" | "caution",
  scope: "element" | "document"   // NEW — determines where the rule is allowed to run
}
```

### 6.1 Element-local rules — safe for the Agent's per-file scan AND Studio
These make no assumption beyond the current file, so they're valid whether the Agent is looking at one template fragment or a whole page:
- `img-alt` (safe), `aria-live-status` (safe), `button-semantics` (caution) *(existing)*
- `form-label` *(existing)* — **downgraded to `caution`** until proximity-pairing and container correlation are fixed in Phase 1; promoted to `safe` only once verified with unit tests.
- `html-lang`, `empty-link`, `empty-heading`, `duplicate-id` (within a file), `tabindex-positive`, `meta-viewport`, table header association *(new)*

### 6.2 Document-level rules — Studio-only, never in the Agent's per-file scan *(new scoping, corrected)*
These assume a fully composed page. `core`'s parser has no cross-file/partial-resolution step — a workflow that ran `heading-order` against `header.hbs` in isolation would false-positive on a `<main>` opened elsewhere. So:
- `heading-order`, `landmark-one-main` (and duplicate-landmark checks) run **only** when a user pastes one complete document into Studio's Playground — never during the Agent's per-commit fragment scan.
- If/when a partial-resolution pass is built (tracked in the appendix), these can be promoted back into the Agent's scan for frameworks where it's implemented.

**Explicitly out of scope for `core` entirely** (needs computed styles/layout, not markup): color contrast, real focus-visibility, reflow-at-400%-zoom. If built at all, these belong in an opt-in Studio-only headless-browser module — never folded into the "zero-dependency" claim.

---

## 7. Progress Tracking — Design Detail (revised: two surfaces, not one)

### 7.1 GitHub Check Run — the primary, zero-extra-infra surface *(updated)*
Created immediately when the webhook or trigger fires, attached to the commit SHA:
```
title:   "fix11y: accessibility scan"
summary: updated in place at each step:
         - "Provisioning GitHub Actions runner VM..." (immediate upon dispatch)
         - "Initializing sandbox environment..."
         - "Auditing template files..."
         - "Fixing files: 3 of 7"
         - "Verifying project build & tests..."
         - "Submitting remediation pull request..."
details_url: https://fix11y.vercel.app/agent?runId=<uuid>
conclusion: set on completion (success/failure), matching the verification and PR outcome
```
This is visible directly in the GitHub PR/commit UI with no separate discovery step — solves the "browser never learns the runId" gap, since the developer is already looking at their commit/PR after pushing.

### 7.2 Upstash progress store — backs the richer Studio panel
```
key:   fix11y:run:{runId}          (runId = crypto.randomUUID(), unguessable)
value: {
  status: "queued" | "running" | "success" | "failed",
  repo, sha, targetVisibility: "public" | "private",
  step: "provisioning_runner" | "init_sandbox" | "initial_audit" | "atomic_file_fix" | "verify_build" | "open_pr" | null,
  file, filesDone, filesTotal,
  prUrl, actionsLogUrl,
  startedAt, updatedAt
}
TTL: 3600s   # auto-expires — no cleanup job needed
```
**Write frequency:**
- **Vercel ingestion:** Writes `status: "queued"` on receipt, then updates to `status: "running"`, `step: "provisioning_runner"` immediately after firing `repository_dispatch`.
- **Job 1 (`patch`):** Updates to `init_sandbox`, `initial_audit`, and per-file updates in `atomic_file_fix`.
- **Job 2 (`verify`):** Updates to `verify_build`.
- **Job 3 (`resolve`):** Updates to `open_pr`, followed by the terminal write (`status: "success"` with `prUrl`, or `status: "failed"` with build failure excerpt).

Both the Check Run update and the Upstash write happen from the same step in each job — one progress event, two destinations (~12–18 writes per run).

**Read path:** browser never talks to Upstash directly. `GET /api/agent/status?runId=xxx` on Vercel is the only reader.

**Failure handling:** if no update lands for 5 minutes while `status: running`, Studio shows a "taking longer than expected" state with a direct link to the Actions run log.

---

## 8. Execution Plan — Phased

1. **Phase 1 (free):** expand `core`'s rule catalog per §6, tagging every rule with `scope: "element" | "document"`. Fix proximity-pairing and container correlation in `form-label` (remaining `caution` until verified). No infra changes.
2. **Phase 2 (free):** stand up `fix11y-runner`; migrate the pipeline off Render/BullMQ/E2B onto GitHub Actions with the three-job DAG (`patch` -> `verify` -> `resolve`, §2.5) from day one. Include dedicated fallback for missing `GEMINI_API_KEY`: audit runs at full scope (both `safe` and `caution` deterministic rules applied for review); any violations requiring AI are explicitly flagged in the PR body as "detected — needs an AI-assisted fix, unavailable without a configured `GEMINI_API_KEY`" rather than dropped.
3. **Phase 3 (free):** implement the public/private routing branch (§2.6): shared runner with App install token for public targets; initial setup PR installing `fix11y-action@v1` using exclusively native `GITHUB_TOKEN` (zero `GITHUB_APP_PRIVATE_KEY` in private templates) for private targets.
4. **Phase 4 (free):** add the Check Run (§7.1) and Upstash progress store with `provisioning_runner` support (§7.2), `/api/agent/status`, and Studio's 6-stage ProgressPanel. Add `/api/agent/trigger` and the "Run Agent now" button (§2.7). Build the Documentation Hub as MDX pages directly sourced from `DOCS.md` (`docs/getting-started`, `docs/core`, `docs/playground`, `docs/agent`, and FAQ).
5. **Phase 5 (free):** end-to-end integration testing: public repo push, private repo setup PR + token run, build failure rejection, Studio on-demand manual trigger test (`/api/agent/trigger`), and accessibility dogfooding.
6. **Phase 6 (optional):** Studio-only browser-based contrast/focus-visibility module — never folded into `core`'s zero-dependency claim.

---

## 9. Platform Shell Scaffold

### 9.1 File structure to create
```
apps/studio/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── playground/
│   │   └── page.tsx
│   ├── agent/
│   │   └── page.tsx
│   ├── docs/
│   │   └── [...slug]/
│   │       └── page.tsx
│   └── api/
│       ├── webhooks/github/route.ts
│       └── agent/status/route.ts
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   └── ThemeToggle.tsx
│   ├── agent/
│   │   └── ProgressPanel.tsx
│   └── providers/
│       └── ThemeProvider.tsx
└── lib/
    └── site-config.ts
```

### 9.2 Terminal commands
```bash
cd apps/studio

npm install next-themes @upstash/redis

mkdir -p app/playground app/agent "app/docs/[...slug]"
mkdir -p app/api/webhooks/github app/api/agent/status app/api/agent/trigger
mkdir -p components/layout components/agent components/providers
mkdir -p lib

touch app/layout.tsx
touch app/api/webhooks/github/route.ts
touch app/api/agent/status/route.ts
touch app/api/agent/trigger/route.ts
touch components/layout/Navbar.tsx components/layout/Footer.tsx components/layout/ThemeToggle.tsx
touch components/agent/ProgressPanel.tsx
touch components/providers/ThemeProvider.tsx
touch lib/site-config.ts

git mv src/app/page.jsx app/playground/page.tsx

npm run build --workspace=fix11y-studio
```

### 9.3 New repos/workflow files to create
```bash
# 1. Shared control repo — PUBLIC, for public target repos only (§2.6)
mkdir fix11y-runner && cd fix11y-runner
git init
mkdir -p .github/workflows src
# workflow: three-job DAG — "patch" (secrets), "verify" (zero secrets, harden-runner), "resolve" (PR creation)

# 2. Reusable composite action repo — PUBLIC (@v1)
mkdir fix11y-action && cd fix11y-action
git init
# action.yml — reusable composite action running the same 3-job workflow logic

# 3. User's private repo workflow — added via initial setup PR (§2.6)
# .github/workflows/fix11y.yml:
# uses: fix11y/fix11y-action@v1
# permissions: contents: write, pull-requests: write, checks: write
# with:
#   gemini-api-key: ${{ secrets.GEMINI_API_KEY }}  # optional
```

---

## Appendix: Open items for future phases
- Whether `/docs` MDX content is hand-authored or partially generated from `packages/core`'s existing JSDoc.
- A partial/include-resolution pass for `core` (resolving `{{> header}}` etc. across files before building the CST) — would allow promoting `heading-order`/`landmark-one-main` back into the Agent's scan for frameworks where the partial convention is knowable.
- Whether to add a lightweight post-fix accessibility re-check (beyond re-running the same rules) before `open_pr`.
- Rate limiting on `/api/webhooks/github` and `/api/agent/status` before exiting beta.
- Transparent disclosure of GitHub App permissions: explain to users that `workflows` permission is requested exclusively to propose the initial setup PR containing `.github/workflows/fix11y.yml`, which is fully inspected and merged by the repository owner.
