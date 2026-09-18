import React from 'react';
import Link from 'next/link';
import { HelpCircle, ArrowRight, ShieldCheck, Cpu, Code2, Sparkles } from 'lucide-react';

export const metadata = {
  title: 'FAQ — fix11y Documentation',
  description: 'Frequently asked questions about fix11y accessibility engine, private code isolation, pricing, and custom rules.',
};

export default function FAQPage() {
  const faqs = [
    {
      icon: ShieldCheck,
      question: 'Does fix11y catch every accessibility problem on my site?',
      answer: (
        <>
          <p className="text-slate-300 leading-relaxed">
            <strong>No</strong> — and we prefer to state that plainly rather than overpromise.
            fix11y catches what is <em>mechanically checkable</em>: missing attributes, non-semantic buttons, unlinked form labels, missing table headers, and structural hierarchy violations.
          </p>
          <p className="text-slate-300 leading-relaxed mt-2">
            A substantial portion of genuine accessibility work — such as whether alt text is contextually meaningful, whether page copy is plain and legible, or whether complex interactive widgets are intuitive when navigated via screen reader — inherently requires human judgment.
            fix11y automates the mechanical boilerplate so engineering teams can focus their attention on essential human decisions.
          </p>
        </>
      ),
    },
    {
      icon: Cpu,
      question: 'Does fix11y see my private code?',
      answer: (
        <>
          <p className="text-slate-300 leading-relaxed">
            <strong>Never for private repositories.</strong>
            For public repositories, code is processed on shared ephemeral runners (<code className="text-accent">fix11y-runner</code>), just like standard open-source CI services.
          </p>
          <p className="text-slate-300 leading-relaxed mt-2">
            For private repositories, fix11y installs a native GitHub Actions workflow (<code className="text-accent">fix11y-action</code>) directly into your repository.
            All scans, patches, and build tests execute completely inside your own GitHub Actions runners.
            No proprietary source code, diffs, or repository contents ever leave your GitHub organization or touch fix11y servers.
          </p>
          <p className="text-slate-300 leading-relaxed mt-2">
            Similarly, the <Link href="/" className="text-accent underline">Studio Playground</Link> runs 100% in your browser using WebAssembly and client-side JavaScript. Nothing you paste is ever transmitted to any backend server.
          </p>
        </>
      ),
    },
    {
      icon: Sparkles,
      question: 'Is fix11y free to use?',
      answer: (
        <>
          <p className="text-slate-300 leading-relaxed">
            <strong>Yes, fix11y is completely free during the public beta.</strong>
            Both the zero-dependency Core engine and the default GitHub Agent workflows run entirely within free-tier infrastructure.
          </p>
          <p className="text-slate-300 leading-relaxed mt-2">
            If your organization has high-volume repositories and requires increased throughput for AI-assisted fixes,
            you can optionally provide your own Google Gemini API key via repository secrets.
          </p>
        </>
      ),
    },
    {
      icon: Code2,
      question: 'Can I write my own rules?',
      answer: (
        <>
          <p className="text-slate-300 leading-relaxed">
            <strong>Yes.</strong> The core remediation engine (<code className="text-accent">@fix11y/core</code>) uses a lightweight, modular rule interface.
            Every rule implements a standard visitor lifecycle with methods to inspect CST elements, evaluate conformance against specific WCAG criteria, and emit non-destructive character offset patches.
          </p>
          <p className="text-slate-300 leading-relaxed mt-2">
            Check the <Link href="/docs/core" className="text-accent underline">Core Documentation</Link> to view the source architecture of built-in rules like <code className="text-slate-200">img-alt</code> and <code className="text-slate-200">button-name</code>.
          </p>
        </>
      ),
    },
  ];

  return (
    <article className="prose prose-invert max-w-none flex flex-col gap-8 text-slate-200">
      {/* Header */}
      <div className="border-b border-border/80 pb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Part 4 • Common Questions</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Frequently Asked Questions
        </h1>
        <p className="text-base text-muted leading-relaxed">
          Clear answers about mechanical scope, privacy invariants, pricing, and extending the rule engine.
        </p>
      </div>

      {/* FAQ List */}
      <div className="flex flex-col gap-6">
        {faqs.map((faq, idx) => {
          const Icon = faq.icon;
          return (
            <section
              key={idx}
              className="border border-border/80 rounded-xl p-5 bg-card/40 flex flex-col gap-3 transition-colors hover:border-border"
            >
              <h2 className="text-base font-bold text-white flex items-center gap-2.5">
                <span className="p-1 rounded-md bg-accent/10 text-accent">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span>{faq.question}</span>
              </h2>
              <div className="text-xs sm:text-sm">{faq.answer}</div>
            </section>
          );
        })}
      </div>

      {/* Navigation Footer */}
      <div className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
        <Link href="/docs/agent" className="text-muted hover:text-white transition-colors">
          ← Part 3: Autonomous Agent
        </Link>
        <Link href="/docs/getting-started" className="text-accent hover:underline flex items-center gap-1">
          <span>Back to Overview</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
