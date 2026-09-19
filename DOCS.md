# fix11y Documentation

*This file is the content source for the `/docs` pillar — structured so each `##` section maps cleanly to an MDX page under `apps/studio/app/docs/[...slug]/`, e.g. `docs/getting-started`, `docs/core`, `docs/playground`, `docs/agent`.*

---

## What is fix11y?

fix11y finds accessibility problems in your HTML and templates, and — for the ones it can fix safely and automatically — fixes them for you.

**Here's the honest version, up front:** no tool, automated or otherwise, can catch every accessibility issue a website might have. A lot of accessibility is about judgment — does this text actually make sense to someone using a screen reader? Is this the *right* description for this image? Those questions need a human. What fix11y does well is the mechanical part: the missing attributes, the wrong HTML elements, the structural things a computer really can check. It fixes what it can fix confidently, and it clearly tells you what still needs your eyes on it.

fix11y has three parts, and you can use any one of them on its own:

| | What it is | Use it when |
|---|---|---|
| **Core** | The rule engine itself — a command-line tool | You want to check or fix a project locally, or in your own CI pipeline |
| **Playground** | A website where you paste code and see it fixed live | You want to learn — see what's wrong and why, no installation needed |
| **Agent** | A bot that watches your GitHub repo and opens pull requests | You want this to happen automatically, every time someone pushes code |

You don't need to use all three. A lot of people start with Playground just to see what it does, then either install the CLI (Core) for their own workflow, or install the Agent so it runs on its own.

---

## Getting started in 60 seconds

**If you just want to see what fix11y does:** go to `/playground`, paste in a chunk of HTML, and watch it work. No install, no signup.

**If you want it running on your own project locally:**
```bash
npx fix11y ./src
```
That's it — no install step, `npx` handles it. This scans everything under `./src` and prints a list of what it found. Nothing gets changed yet.

**If you want it to actually fix things:**
```bash
npx fix11y ./src --fix
```
This walks you through each fix interactively, so you can see exactly what's about to change before it changes it.

**If you want it to just fix everything it's confident about, no questions asked:**
```bash
npx fix11y ./src --safety safe -y
```

We'll explain every flag in detail in the Core section below.

---

## Part 1 — Core (the CLI and rule engine)

### What it actually does

Core reads your HTML or template files, builds a structural map of the document (we call this a CST — don't worry about the acronym, it just means "fix11y understands where every tag and attribute actually starts and ends in your file"), checks that map against a list of accessibility rules, and — if you ask it to — makes the smallest possible edit to fix each problem it finds.

That "smallest possible edit" part matters. fix11y never rewrites your whole file. It doesn't reformat your code, change your quote style, or touch anything it wasn't asked to fix. If your file has a Handlebars `{{#if}}` block or a Mustache comment in it, fix11y knows not to break that either. It only changes the exact characters it needs to.

### What it checks today

Every rule below tells you *why* it matters, not just *what* it does — that's intentional. Understanding the "why" is most of what makes you better at writing accessible code in the first place.

- **Missing image descriptions (`img-alt`)** — An `<img>` with no `alt` attribute is invisible to someone using a screen reader; they just hear "image" with no idea what it shows. This rule adds one.
- **Unlabeled form fields (`form-label`)** — If an input has no associated `<label>`, a screen reader user has no idea what they're supposed to type into it. This rule connects labels to their inputs.
- **Non-semantic buttons (`button-semantics`)** — A `<div onclick="...">` might *look* like a button, but it's invisible to keyboard navigation and screen readers, which expect a real `<button>`. This rule fixes the underlying element.
- **Missing live-region announcements (`aria-live-status`)** — When content on a page updates dynamically (a form error appears, a cart total changes) without a page reload, screen readers won't notice unless that region is explicitly marked as "live." This rule adds that marking.

Each rule is tagged with a **safety tier**:
- **`safe`** — fix11y is confident this fix is correct and won't change the meaning of your page. Fine to auto-apply.
- **`caution`** — the fix is structurally valid, but you should glance at it, because getting it exactly right sometimes needs context fix11y doesn't have (for example: `alt=""` is the safe default for a decorative image, but if the image is actually meaningful, the *right* alt text is something only you know).

### What it doesn't catch today (scope limitations)

Being honest about boundaries is just as important as knowing what fix11y covers. The v1 engine intentionally defers the following cases to human review:

- **Ambiguous link text with existing content (`<a>click here</a>`, `learn more`):** `empty-link` strictly checks whether an interactive anchor lacks an accessible name (empty text, missing `aria-label`, missing icon title). If a link contains visible text like "click here", it has an accessible name, but fails WCAG 2.4.4 / 2.4.9 (Link Purpose in Context). Evaluating whether visible link text provides sufficient standalone context requires editorial judgment and is deferred in v1.
- **Images with undetermined intent (`'unknown'` branch):** When an `<img>` tag lacks both decorative signals (e.g. `spacer`, `divider`) and meaningful signals (e.g. `logo`, `diagram`, interactive parent), fix11y refuses to guess. Rather than dangerously converting it to decorative `alt=""` or injecting a generic placeholder like `alt="Image"`, fix11y emits a caution diagnostic with **zero auto-patches**, flagging it for human review.
- **Whole-document landmark hierarchy in template fragments:** Full-page structural checks (such as single `<main>` landmark or heading level jumps) only execute when scanning complete HTML documents in Studio Playground. They do not run during file-level CI scans on template partials (where headers, sidebars, and footers are assembled by downstream build tools).

### CLI reference

```bash
npx fix11y <path>              # Scan and report — nothing is changed
npx fix11y <path> --fix         # Interactively review and apply fixes, one at a time
npx fix11y <path> --ci           # Exit with a non-zero status if violations are found — use this in a CI pipeline to fail a build on accessibility issues
npx fix11y <path> --json          # Print machine-readable output instead of the human-readable report
npx fix11y <path> --safety safe    # Only touch `safe`-tier fixes; leave `caution`-tier ones for you to review manually
npx fix11y <path> --safety safe -y  # Combine the above with auto-confirm — apply every safe fix without asking
```

### Using it in your own CI
Since Core has zero external dependencies, it runs anywhere Node.js does — GitHub Actions, GitLab CI, a pre-commit hook, wherever. A common pattern:
```yaml
- run: npx fix11y ./src --ci
```
This fails the build if any violations exist, so nothing with an accessibility issue merges silently.

### Writing your own rule
Every rule in fix11y follows the same small pattern — a class that looks at the document structure and reports what it finds. If you want to add a check that isn't covered yet, the `docs/writing-a-rule` guide walks through building one end to end, using one of the existing rules as a worked example. This is genuinely one of the best ways to actually learn how accessibility checking works under the hood, not just use the output.

---

## Part 2 — Playground

### What it's for
Playground is fix11y running entirely in your browser — nothing you paste in is sent to a server. It's the fastest way to answer "what would fix11y do with this code?" without installing anything.

### How to use it
1. Paste HTML, JSX, or TSX source into the editor.
2. fix11y scans it instantly using the same rule engine as the CLI — same rules, same logic, same results you'd get running it locally.
3. Each problem found shows up in the diagnostics list. Click on one to see:
   - **What's wrong**, in plain language.
   - **Which WCAG guideline** it relates to, if you want to go deeper.
   - **The safety tier** — is this a fix you could trust blindly, or one worth reading closely?
4. Click **"explain this fix"** on any diagnostic to expand the full reasoning — this is the part built specifically for learning, not just fixing.
5. The diff view shows exactly what would change. Copy the fixed code out when you're happy with it.

### A couple of things worth knowing
- **Paste a whole file, not a fragment, if you want the most thorough check.** Playground can also catch a couple of "does the whole page make sense structurally" issues — like whether your headings skip a level, or whether you have more than one `<main>` on the page — but only if it can see the entire document. These specific checks are Playground-only; they don't run automatically when the Agent scans a repo, because a repo is often made of many small template pieces (like a shared header file and a shared footer file) glued together at build time, and fix11y can't safely guess how those pieces fit together from one piece alone.
- **Playground shows you what a fix would look like — it doesn't touch a real project for you.** For that, you want the CLI (Core) running locally, or the Agent running automatically on your repo. Playground can't clone a repository, run your project's build, or open a pull request — it works on the text you paste, nothing more. Think of it as a preview: the same engine, just without a real project behind it to prove the fix against or ship it into.

---

## Part 3 — Agent

### What it does
The Agent installs on a GitHub repository and watches for new pushes. When one happens, it automatically:
1. Scans the changed files for accessibility issues.
2. Fixes everything it can confidently fix on its own.
3. For anything trickier — where the right fix needs a bit of judgment — it asks an AI model to propose a fix, but constrains that model tightly: it can only suggest small, structural edits, never rewrite your file wholesale.
4. Double-checks that none of these changes broke your project's build.
5. Opens a pull request with everything it fixed, clearly labeled by safety tier, so you can tell at a glance what's safe to merge as-is and what's worth a closer look.

You review and merge (or don't) — the Agent never merges anything itself.

### Installing it
Go to `/agent` and click **"Install on GitHub."** What happens next depends on whether your repo is public or private:

- **Public repo:** installs instantly, adds nothing visible to your repository. From your next push onward, it just works.
- **Private repo:** you'll be shown a small workflow file before it's added to your repo, and asked to approve it. This is intentional — it means your code, and everything the Agent does while looking at it, never leaves your own repository's logs. Nothing about a private repo is ever visible to fix11y's own shared infrastructure.

### Watching it work
After a push, you don't need to go looking for anything — a status check appears directly on your commit (the same place any other CI check shows up), with a live-updating one-line summary like *"Fixing files: 3 of 7."* Click **"Details"** on that check to open a fuller live progress view on `/agent`, with a step-by-step breakdown of exactly what's happening.

For public repositories, you can also trigger a run manually anytime — no need to push a throwaway commit just to see it work. Go to `/agent`, find your repo, and click **"Run Agent now."** For private repositories, runs trigger automatically on push or can be triggered manually directly from your repository's GitHub Actions tab (**Run workflow** under the *fix11y Accessibility Remediation* workflow), ensuring your code never leaves your own GitHub Actions environment.

### Reading the pull request it opens
Every PR the Agent opens lists what it changed, organized by safety tier:
- Fixes marked **safe** are, well, safe — you can merge with confidence.
- Fixes marked **caution** are structurally correct but worth a real look, especially anything involving an AI-suggested fix for a judgment-based issue (like writing meaningful image descriptions). Treat these the way you'd treat a helpful but not-infallible teammate's suggestion.

### If something goes wrong
If a build check fails after a patch is applied, no pull request opens at all — you'll see that reflected in the status check on your commit, along with a link to the full log so you can see exactly which step failed and why. The Agent never opens a PR it hasn't verified still builds.

---

## Frequently asked questions

**Does fix11y catch every accessibility problem on my site?**
No — and we'd rather tell you that plainly than have you find out the hard way. It catches what's mechanically checkable (see Part 1's rule list and scope limitations, such as ambiguous link phrasing like 'click here' or signal-free images). A lot of real accessibility work — is this wording actually clear? does this page make sense read aloud top to bottom? — needs a human, always will. Think of fix11y as clearing out the mechanical issues so you can spend your attention on the judgment calls that actually need it.

**Does fix11y see my private code?**
For public repos, yes — that's how it scans and fixes things, same as any CI tool. For private repos, fix11y is specifically designed so that everything stays inside your own repository's own logs and Actions minutes — nothing about a private repo's code is processed anywhere fix11y itself can see it. Playground never sends anything you paste to a server at all.

**Is this free?**
Yes, for the beta. Both Core and the Agent's default configuration are built to run entirely on free infrastructure tiers. If you want to use your own AI provider key for higher throughput on the Agent's AI-assisted fixes, that's optional and only relevant at higher usage.

**Can I write my own rules?**
Yes — see "Writing your own rule" in Part 1. It's one of the more approachable ways to actually learn how automated accessibility checking works, not just consume its output.
