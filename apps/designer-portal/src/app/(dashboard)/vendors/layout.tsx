import type { Metadata } from 'next';
import { VendorsProvider } from '@/components/vendors';

export const metadata: Metadata = {
  title: 'Vendors | Patina',
  description: 'Browse and manage your vendor relationships',
};

export default function VendorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <VendorsProvider>{children}</VendorsProvider>;
}
