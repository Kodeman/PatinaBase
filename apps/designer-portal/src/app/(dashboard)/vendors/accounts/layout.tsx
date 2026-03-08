import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Trade Accounts | Patina',
  description: 'Manage your trade account relationships with vendors',
};

export default function TradeAccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
