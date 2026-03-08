import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
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
  variable: '--font-heading',
  display: 'swap',
});

const fontVariables = `${inter.variable} ${playfair.variable}`;

export const metadata: Metadata = {
  title: 'Patina Designer Portal',
  description: 'Custom home furnishing platform for interior designers',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontVariables} font-sans antialiased`.trim()}>
        <Providers>
          {children}
          <DebugPanel />
        </Providers>
      </body>
    </html>
  );
}
