import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Playfair_Display, DM_Mono } from 'next/font/google';

import { Providers } from './providers';
import { AppChrome } from '@/components/layout/app-chrome';
import { fetchClientProjects } from '@/lib/data/projects';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-playfair',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Patina Client Portal',
  description:
    'Track project milestones, review deliverables, and collaborate with your Patina team in one immersive timeline experience.',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

const bodyClassName = `${inter.variable} ${playfair.variable} ${dmMono.variable} bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased`;

// Workstream D-B2 (docs/engineering/repoint-b0-audit.md): server-read so a
// later Supabase repoint flips this var + redeploys instead of rebuilding
// the bundle. Falls back to today's build-time NEXT_PUBLIC_SUPABASE_URL
// inline — this wave changes no value, only makes the origin
// runtime-resolvable at today's value.
const supabaseOriginRuntime =
  process.env.SUPABASE_ORIGIN_RUNTIME || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export default async function RootLayout({ children }: RootLayoutProps) {
  // Fetched once for the whole app so the global header/switcher is available
  // on every authenticated page. Returns [] with no session (RLS) or on error,
  // so public/auth routes render fine; layouts are not re-run on client-side
  // navigation, so this is cheaper than the old per-page fetch.
  const projects = await fetchClientProjects().catch(() => []);

  return (
    <html lang="en" className="bg-[var(--bg-primary)]">
      <body className={bodyClassName}>
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
          <div className="min-h-screen bg-[var(--bg-primary)]">
            <AppChrome projects={projects}>{children}</AppChrome>
          </div>
        </Providers>
      </body>
    </html>
  );
}
