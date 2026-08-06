import type { ReactNode } from 'react';
import { PortalAuthShell, type PortalAuthQrProps } from '@patina/design-system';

export const DESIGNER_AUTH_DESTINATION = '/desk';

export function DesignerAuthShell({
  children,
  qr,
}: {
  children: ReactNode;
  /** The ambient countdown QR badge. Only the sign-in page hands one over. */
  qr?: PortalAuthQrProps;
}) {
  return (
    <PortalAuthShell
      eyebrow="THE STUDIO"
      title="Welcome back to the studio."
      description="Your projects, proposals, and workshop records are waiting."
      accent="#C4A57B"
      supportEmail="support@patina.cloud"
      qr={qr}
    >
      {children}
    </PortalAuthShell>
  );
}
