# fix11y — Agent Governance & Operating Invariants

`fix11y` is a zero-dependency, developer-focused accessibility remediation engine and interactive web playground. It scans HTML and web template files (HTML5, Mustache, Handlebars), detects WCAG 2.1/2.2 AA violations, generates unified diffs, and interactively or autonomously applies non-destructive AST patches across CLI and Web Studio environments.

---

## 1. Core Operating Invariants

### Invariant 1: Strict Zero-Dependency Policy for `@fix11y/core`
* **Zero npm packages in Core**: The engine package (`packages/core`) must strictly have **0 runtime and 0 dev dependencies** in its `package.json`.
* **Standard Library Only**: All core functionality relies entirely on Node.js v20+ LTS native modules (`node:fs`, `node:path`, `node:util`, `node:readline`, `node:test`, `node:assert`, `node:process`).

### Invariant 2: Offset-Based Surgical Patching (CST Model)
* **No Full-Document Reserialization**: Never parse to an AST and serialize the entire document back to string. Full serialization corrupts partial templates, strips comments, alters quotation styles, and collapses whitespace.
* **Character Offset Spans**: Every parsed token, element, attribute, and text node maintains exact character start and end indices (`startOffset`, `endOffset`, `loc: { start: { line, column }, end: { line, column } }`).
* **Surgical Splice & Patch**: Remediations apply string replacements exclusively at targeted character offsets, preserving 100% of untouched bytes, formatting, and surrounding context.

### Invariant 3: Template-Safe Tokenization
* **Template Syntax Preservation**: `{{...}}`, `{{{...}}}`, `{{#...}}`, `{{/...}}`, `{{^...}}`, and `{{>...}}` tags are parsed losslessly without corrupting tag hierarchies, attribute lists, or raw text.
* **Scope**: Target HTML5 and Mustache / Handlebars templates. JSX / TSX is deferred to future major versions.

### Invariant 4: Browser Environment Isolation
* **Universal Execution**: The core programmatic API (`@fix11y/core`) must run identically in Node.js (CLI) and browser runtimes (Next.js / Web Studio).
* **Safe Guards**: Core modules must never assume `process.stdout` or Node-only globals exist without safe guards (`typeof process !== 'undefined'`).

### Invariant 5: Dogfooding Accessibility in `apps/studio`
* **WCAG 2.2 AA Compliance**: All UI apps in the monorepo must strictly adhere to accessibility standards:
  - Accessible landmarks (`<header>`, `<main>`, `<nav>`, `<aside>`, `<output>`).
  - Active `aria-live="polite"` live status announcer for asynchronous scan results.
  - High-contrast visual tokens (minimum 4.5:1 text contrast) and visible focus rings.

### Invariant 6: No Full-File LLM Reserialization (`apps/agent`)
* **Strict CST Surgical Patching**: The LLM must NEVER output or rewrite full file contents. All remediations are produced as localized replacement chunks and applied exclusively via `@fix11y/core`'s CST patcher (`applyPatches`).
* **Preservation Guarantee**: Untouched code, template directives, comments, and quotation styles are mathematically guaranteed to remain 100% intact.

### Invariant 7: Atomic In-Memory CST Re-Parsing (`apps/agent`)
* **Offset Drift Prevention**: When a file has multiple violations, each patch is applied sequentially. Between patches, the file content is re-parsed in memory to regenerate fresh, accurate character offsets.
* **Zero Offset Drift**: Never apply subsequent patches using stale character offsets.

### Invariant 8: E2B MicroVM Sandbox Isolation & Zero Secrets in Sandbox (`apps/agent`)
* **Air-Gapped Credentials**: Untrusted target repository code is cloned and verified exclusively inside an isolated E2B microVM.
* **No Host Leaks**: Host environment variables, GitHub App private keys, and LLM API keys are NEVER mounted or passed into the microVM container.
* **Egress-Only Filtering**: MicroVM sandboxes permit outbound package installations (npm, yarn) while blocking RFC1918 private network ranges to prevent SSRF.

### Invariant 9: Accessible Human-Agent Interface (`apps/agent`)
* **Screen-Reader & Non-TTY Friendliness**: The CLI orchestrator must support `--accessible` (and `--no-color`) modes.
* **Flat Milestone Streams**: When accessible mode is active, dynamic spinners, ANSI cursor movement, and `\r` carriage return rewrites are strictly suppressed in favor of line-buffered semantic milestone logs (`[START]`, `[INFO]`, `[SUCCESS]`, `[WARNING]`, `[ERROR]`, `[RETRY]`).

---

## 2. Monorepo Directory Architecture

```text
fix11y/
├── packages/
│   └── core/                 # Zero-dependency remediation engine (@fix11y/core)
│       ├── bin/
│       │   └── fix11y.js     # Executable CLI entry point (parseArgs, exit codes)
│       ├── src/
│       │   ├── index.js      # Programmatic Public API
│       │   ├── parser/       # Tokenizer, CST builder, surgical patcher
│       │   ├── rules/        # WCAG 2.1 AA rule registry & evaluators
│       │   └── ui/           # Myers diff algorithm & terminal reporters
│       ├── tests/            # 37/37 native Node test suite & fixtures
│       └── package.json      # name: "@fix11y/core" (0 dependencies)
├── apps/
│   ├── studio/               # Web Playground & Visual Remediation Studio
│   │   ├── src/
│   │   │   ├── app/          # Next.js App Router (page, layout, globals.css)
│   │   │   ├── components/   # Split Editor, Diff Viewer, Diagnostic Drawer
│   │   │   └── hooks/        # useFix11y client-side engine hook
│   │   ├── package.json      # Next.js, React, Tailwind CSS
│   │   └── next.config.mjs   # transpilePackages: ['@fix11y/core']
│   └── agent/                # Autonomous Accessibility Engineer (@fix11y/agent)
│       ├── src/
│       │   ├── cli/          # Accessible CLI logger & runner
│       │   ├── webhook/      # Asynchronous GitHub webhook router & BullMQ queue
│       │   ├── worker.ts     # BullMQ background job consumer with graceful shutdown
│       │   └── index.ts      # Public programmatic API
│       ├── tests/            # Phase 1 unit test suite (AccessibleLogger, Webhook)
│       ├── tsconfig.json     # Strict TypeScript configuration (NodeNext)
│       └── package.json      # LangGraph, Google Gemini, E2B, BullMQ, ioredis
├── GEMINI.md                 # Monorepo governance & operating invariants
├── README.md                 # CLI, Web Studio & Autonomous Agent documentation
└── package.json              # Monorepo workspaces root
```

---

## 3. Development & Testing Standards

* **Test Runner**: Run all tests across workspaces via `npm test` (`npm test --workspaces --if-present`).
* **Cross-Platform Compatibility**: Diffs and character offsets handle both `LF` and `CRLF` newlines seamlessly.
* **Deterministic Output**: Remediation mutations and diff outputs are 100% deterministic (stable IDs derived from element tag, name, or source index).
