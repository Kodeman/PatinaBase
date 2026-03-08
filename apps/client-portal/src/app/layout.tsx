import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';

import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
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

const bodyClassName = `${inter.variable} ${playfair.variable} bg-[var(--color-canvas)] text-[var(--color-text)] antialiased`;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="bg-[var(--color-canvas)]">
      <body className={bodyClassName}>
        <Providers>
          <div className="min-h-screen bg-[var(--color-canvas)]">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
