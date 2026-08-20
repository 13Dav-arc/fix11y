# fix11y — Agent Governance & Operating Invariants

`fix11y` is a zero-dependency, developer-focused CLI and automated remediation engine. It scans HTML and web template files (HTML5, Mustache, Handlebars), detects WCAG 2.1/2.2 AA accessibility violations, generates unified diffs, and interactively or autonomously applies non-destructive AST patches.

---

## 1. Core Operating Invariants

### Invariant 1: Strict Zero-Dependency Policy
* **Zero npm packages**: The project must strictly have **0 runtime and 0 dev dependencies** in `package.json`.
* **Standard Library Only**: All functionality must rely entirely on Node.js v20+ LTS native modules:
  - `node:fs` / `node:fs/promises` (File discovery & I/O)
  - `node:path` (Cross-platform path resolution)
  - `node:util` (`parseArgs` for zero-dependency CLI arguments)
  - `node:readline` / `node:readline/promises` (Interactive TTY prompts)
  - `node:test` & `node:assert` (Unit & E2E testing framework)
  - `node:process` & ANSI escape codes (Terminal styling & exit codes)

### Invariant 2: Offset-Based Surgical Patching (CST Model)
* **No Full-Document Reserialization**: Never parse to an AST and serialize the entire document back to string. Full serialization corrupts partial templates, strips comments, alters quotation styles, and collapses whitespace.
* **Character Offset Spans**: Every parsed token, element, attribute, and text node must maintain exact character start and end indices (`startOffset`, `endOffset`, `loc: { start: { line, column }, end: { line, column } }`).
* **Surgical Splice & Patch**: Remediations apply string replacements exclusively at targeted character offsets, preserving 100% of all untouched bytes, formatting, and surrounding context.

### Invariant 3: Template-Safe Tokenization
* **Template Syntax Preservation**: `{{...}}`, `{{{...}}}`, `{{#...}}`, `{{/...}}`, `{{^...}}`, and `{{>...}}` tags must be parsed losslessly without corrupting tag hierarchies, attribute lists, or raw text.
* **Scope**: Target HTML5 and Mustache / Handlebars templates. JSX / TSX is deferred to future major versions requiring a dedicated JavaScript/TypeScript tokenizer.

### Invariant 4: Remediation Safety & Confidence Classes
* **Safe / Auto-Patchable**:
  - `rule-image-alt`: Injects missing `alt=""` or contextual `alt` attribute.
  - `rule-form-labels`: Deterministic `id` generation and `<label for="...">` pairing or `aria-label` injection.
  - `rule-aria-live`: Dynamic/search feedback regions lacking `aria-live="polite"`.
* **Review-Advised / Caution**:
  - `rule-semantic-buttons`: Non-semantic interactive element fixes (`<div onclick="...">` -> `<button type="button">`), requiring explicit user review to avoid CSS class or event propagation regressions.
  - `rule-landmarks`: Top-level landmark recommendations (`<header>`, `<main>`, `<footer>`), flagged for review to prevent layout breaking in CSS Grid/Flexbox contexts.

---

## 2. Directory & Module Architecture

```text
fix11y/
├── bin/
│   └── fix11y.js             # Executable CLI entry point (parseArgs, exit codes)
├── src/
│   ├── index.js              # Core programmatic API (scan, lint, fix, diff)
│   ├── parser/
│   │   ├── tokenizer.js      # Zero-dep HTML5/Mustache lexer with character offsets
│   │   ├── parser.js         # Concrete Syntax Tree (CST) builder
│   │   └── patcher.js        # Offset-based surgical string replacer / splice engine
│   ├── rules/
│   │   ├── base-rule.js      # Base rule contract (meta, evaluate, fix)
│   │   ├── rule-form-labels.js     # Missing label / input association
│   │   ├── rule-semantic-buttons.js # Div/anchor button semantics
│   │   ├── rule-image-alt.js       # Missing image alt attributes
│   │   ├── rule-landmarks.js       # Landmark structural checks
│   │   └── index.js          # Rule registry & evaluator
│   ├── diff/
│   │   ├── myers.js          # Zero-dependency Myers diff algorithm
│   │   └── formatter.js      # ANSI unified diff formatter (@@ -l,s +l,s @@)
│   └── ui/
│       ├── prompt.js         # Interactive CLI prompt (y/n/all/q)
│       └── reporter.js       # CI / table / JSON error reporter
├── tests/
│   ├── fixtures/             # Raw vs. expected templates and HTML fixtures
│   ├── tokenizer.test.js     # Tokenizer offset accuracy & template tag tests
│   ├── parser.test.js        # CST hierarchy & location tracking tests
│   ├── patcher.test.js       # Surgical string splicing tests
│   ├── rules.test.js         # Unit tests for WCAG rule evaluation & mutators
│   ├── diff.test.js          # Unified diff algorithm tests
│   └── cli.test.js           # E2E CLI tests (--fix, --ci, dry-run)
├── GEMINI.md                 # Operating invariants & governance
└── package.json              # Project manifest (0 dependencies)
```

---

## 3. Development & Testing Standards

* **Test Runner**: Run all tests via `npm test` (`node --test tests/*.test.js`).
* **Cross-Platform Compatibility**: Diffs and character offsets must handle both `LF` and `CRLF` newlines seamlessly.
* **Deterministic Output**: Remediation mutations and diff outputs must be 100% deterministic (no random UUIDs; use stable naming algorithms derived from element tag, name, or source position).
