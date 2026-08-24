import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Patina · Manufacturer',
  description: 'Patina Catalog manufacturer onboarding and catalog management.',
};

// Workstream D-B2 (docs/engineering/repoint-b0-audit.md): server-read so a
// later Supabase repoint flips this var + redeploys instead of rebuilding
// the bundle. Falls back to today's build-time NEXT_PUBLIC_SUPABASE_URL
// inline — this wave changes no value, only makes the origin
// runtime-resolvable at today's value.
const supabaseOriginRuntime =
  process.env.SUPABASE_ORIGIN_RUNTIME || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

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
        {/*
          Workstream D-B2: emits the runtime Supabase origin before the app
          bundle hydrates. Next's beforeInteractive strategy queues this
          inline script into self.__next_s at render position, but the
          CLIENT RUNTIME (not document order) is what enforces the ordering
          guarantee: main-app's bootstrap explicitly appends+executes every
          queued beforeInteractive script to document.head and only THEN
          calls the hydrate callback (verified against the compiled chunk —
          see docs/engineering/repoint-b0-audit.md). A hand-authored <head>
          <script> looked more literal but is NOT race-free against Next's
          own async bundle chunks; this is the framework-blessed mechanism.
          packages/supabase's client.ts reads
          globalThis.__PATINA_SUPABASE_ORIGIN lazily at client-construction
          time (not module-eval time), so it only needs to win this race
          once, before hydration — which this strategy guarantees.
        */}
        <Script id="patina-supabase-origin" strategy="beforeInteractive">
          {`globalThis.__PATINA_SUPABASE_ORIGIN = ${JSON.stringify(supabaseOriginRuntime)};`}
        </Script>
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
