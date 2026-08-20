import './globals.css';

export const metadata = {
  title: 'fix11y Studio — Visual Accessibility Remediation Engine',
  description: 'Zero-dependency interactive playground for automated WCAG 2.1/2.2 AA accessibility scanning, surgical AST patching, and unified diff inspection.',
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
