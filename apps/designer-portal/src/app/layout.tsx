import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Playfair_Display, DM_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/providers/providers';
import { DebugPanel } from '@/components/DebugPanel';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-heading',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const fontVariables = `${inter.variable} ${playfair.variable} ${dmMono.variable}`;

export const metadata: Metadata = {
  title: 'Patina Designer Portal',
  description: 'Custom home furnishing platform for interior designers',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

// Workstream D-B2 (docs/engineering/repoint-b0-audit.md): server-read so a
// later Supabase repoint flips this var + redeploys instead of rebuilding
// the bundle. Falls back to today's build-time NEXT_PUBLIC_SUPABASE_URL
// inline — this wave changes no value, only makes the origin
// runtime-resolvable at today's value.
const supabaseOriginRuntime =
  process.env.SUPABASE_ORIGIN_RUNTIME || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontVariables} font-sans antialiased`.trim()}>
        {/*
          Workstream D-B2: emits the runtime Supabase origin before the app
          bundle hydrates. Next's beforeInteractive strategy queues this
          inline script into self.__next_s at render position, but the
          CLIENT RUNTIME (not document order) is what enforces the ordering
          guarantee: main-app's bootstrap explicitly appends+executes every
          queued beforeInteractive script to document.head and only THEN
          calls the hydrate callback (verified against the compiled chunk —
          see docs/engineering/repoint-b0-audit.md). packages/supabase's
          client.ts reads globalThis.__PATINA_SUPABASE_ORIGIN lazily at
          client-construction time (not module-eval time), so it only needs
          to win this race once, before hydration — which this strategy
          guarantees.
        */}
        <Script id="patina-supabase-origin" strategy="beforeInteractive">
          {`globalThis.__PATINA_SUPABASE_ORIGIN = ${JSON.stringify(supabaseOriginRuntime)};`}
        </Script>
        <Providers>
          {children}
          <DebugPanel />
        </Providers>
      </body>
    </html>
  );
}
