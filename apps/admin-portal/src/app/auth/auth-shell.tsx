import type { ReactNode } from 'react';
import { PortalAuthShell } from '@patina/design-system';

export const ADMIN_AUTH_DESTINATION = '/dashboard';

export function AdminAuthShell({ children }: { children: ReactNode }) {
  return (
    <PortalAuthShell
      eyebrow="PATINA OPERATIONS"
      title="Keep the work moving."
      description="Sign in to review the people, orders, and systems behind Patina."
      accent="#8397A8"
      supportEmail="support@patina.com"
    >
      {children}
    </PortalAuthShell>
  );
}
