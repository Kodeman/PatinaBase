import type { ReactNode } from 'react';
import { PortalAuthShell } from '@patina/design-system';

export const DESIGNER_AUTH_DESTINATION = '/desk';

export function DesignerAuthShell({ children }: { children: ReactNode }) {
  return (
    <PortalAuthShell
      eyebrow="THE STUDIO"
      title="Welcome back to the studio."
      description="Your projects, proposals, and workshop records are waiting."
      accent="#C4A57B"
      supportEmail="support@patina.com"
    >
      {children}
    </PortalAuthShell>
  );
}
