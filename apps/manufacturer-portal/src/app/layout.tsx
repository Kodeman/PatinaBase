import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Patina · Manufacturer',
  description: 'Patina Catalog manufacturer onboarding and catalog management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          color: '#2C2926',
          background: '#FAF7F2',
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid #E5E2DD',
            background: '#FFFFFF',
          }}
        >
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '1.05rem',
              fontWeight: 500,
            }}
          >
            Patina · Manufacturer
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: "'DM Mono', ui-monospace, monospace",
              fontSize: '0.62rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#8B7355',
            }}
          >
            Scaffold · Sprint 3 deliverable
          </div>
        </header>
        <main style={{ padding: '40px 24px', maxWidth: 720, margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
