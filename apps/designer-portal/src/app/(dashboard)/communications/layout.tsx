'use client';

import { AdminGate } from '@/components/admin/AdminGate';

export default function CommunicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGate fallbackMessage="You need admin privileges to access Communications.">
      {children}
    </AdminGate>
  );
}
