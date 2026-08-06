import type { ReactNode } from 'react';
import { PortalAuthShell, type PortalAuthQrProps } from '@patina/design-system';

export const ADMIN_AUTH_DESTINATION = '/dashboard';

export function AdminAuthShell({
  children,
  qr,
}: {
  children: ReactNode;
  /** The ambient countdown QR badge. Omitted, the pane renders exactly as before. */
  qr?: PortalAuthQrProps;
}) {
  return (
    <PortalAuthShell
      eyebrow="PATINA OPERATIONS"
      title="Keep the work moving."
      description="Sign in to review the people, orders, and systems behind Patina."
      accent="#8397A8"
      supportEmail="support@patina.cloud"
      qr={qr}
    >
      {children}
    </PortalAuthShell>
  );
}
