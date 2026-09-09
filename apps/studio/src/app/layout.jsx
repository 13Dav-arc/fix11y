import './globals.css';

const siteUrl = 'https://fix11y.vercel.app/';
const ogImageUrl = 'https://fix11y.vercel.app/og-image.png';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'fix11y Studio — Visual Accessibility Remediation Engine',
  description:
    'Zero-dependency automated WCAG 2.1/2.2 AA accessibility remediation engine & visual playground. Detects violations, generates unified diffs, and applies surgical AST patches in-browser.',
  openGraph: {
    type: 'website',
    url: siteUrl,
    title: 'fix11y Studio — Visual Accessibility Remediation Engine',
    description:
      'Instant, automated WCAG 2.1/2.2 AA accessibility fixes for HTML5 and Mustache templates. 100% private, runs client-side in your browser.',
    siteName: 'fix11y Studio',
    locale: 'en_US',
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'fix11y Studio interface showing side-by-side code remediation and WCAG diagnostics',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    url: siteUrl,
    title: 'fix11y Studio — Visual Accessibility Remediation Engine',
    description:
      'Instant, automated WCAG 2.1/2.2 AA accessibility fixes for HTML5 and Mustache templates. 100% private, runs client-side in your browser.',
    images: [ogImageUrl],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas text-slate-100 antialiased flex flex-col selection:bg-accent/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
