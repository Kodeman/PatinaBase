import type { Metadata } from 'next';
import { Inter, Playfair_Display, DM_Mono } from 'next/font/google';

import { Providers } from './providers';
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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="bg-[var(--bg-primary)]">
      <body className={bodyClassName}>
        <Providers>
          <div className="min-h-screen bg-[var(--bg-primary)]">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
