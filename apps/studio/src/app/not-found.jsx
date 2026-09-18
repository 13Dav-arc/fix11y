import React from 'react';
import Link from 'next/link';
import { Navbar } from '../components/Navbar.jsx';
import { FileQuestion, ArrowLeft, Home, BookOpen } from 'lucide-react';

export const metadata = {
  title: '404: Page Not Found — fix11y Studio',
  description: 'The requested page could not be found.',
};

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen bg-canvas text-slate-100">
      <Navbar activeTab="" />

      <main
        id="main-content"
        className="flex-1 max-w-2xl w-full mx-auto p-6 flex flex-col items-center justify-center text-center gap-6 my-auto"
      >
        <div className="p-4 rounded-2xl bg-card border border-border text-accent shadow-xl">
          <FileQuestion className="w-12 h-12 text-accent" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-caution/10 border border-caution-border text-caution w-fit mx-auto">
            404 Error
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Page Not Found
          </h1>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            The page you are looking for doesn&apos;t exist or has been moved. Use the links below to navigate back to the studio or documentation.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-canvas font-semibold text-xs hover:bg-accent-hover transition-colors shadow-sm"
          >
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Return to Studio</span>
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-cardHover text-slate-200 text-xs font-medium transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span>View Documentation</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
