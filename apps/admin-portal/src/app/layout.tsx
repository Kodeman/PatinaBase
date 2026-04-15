import type { Metadata } from 'next';
import { Inter, Playfair_Display, DM_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';

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
  title: 'Patina Admin Portal',
  description: 'Platform administration and management',
  robots: 'noindex, nofollow',
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
          <Toaster
            position="top-right"
            expand={false}
            richColors
            closeButton
            duration={4000}
          />
        </Providers>
      </body>
    </html>
  );
}
