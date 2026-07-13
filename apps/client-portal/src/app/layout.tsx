import type { Metadata } from 'next';
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

export default async function RootLayout({ children }: RootLayoutProps) {
  // Fetched once for the whole app so the global header/switcher is available
  // on every authenticated page. Returns [] with no session (RLS) or on error,
  // so public/auth routes render fine; layouts are not re-run on client-side
  // navigation, so this is cheaper than the old per-page fetch.
  const projects = await fetchClientProjects().catch(() => []);

  return (
    <html lang="en" className="bg-[var(--bg-primary)]">
      <body className={bodyClassName}>
        <Providers>
          <div className="min-h-screen bg-[var(--bg-primary)]">
            <AppChrome projects={projects}>{children}</AppChrome>
          </div>
        </Providers>
      </body>
    </html>
  );
}
