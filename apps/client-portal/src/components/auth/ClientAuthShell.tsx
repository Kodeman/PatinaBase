import type { ComponentProps } from 'react';
import { PortalAuthShell } from '@patina/design-system/PortalAuth';

const CLIENT_AUTH_BRAND = {
  eyebrow: 'YOUR HOME',
  title: 'Good to see you.',
  description: 'Your project, decisions, and orders are ready when you are.',
  accent: '#8FA18B',
  supportEmail: 'support@patina.cloud',
} as const;

type ClientAuthShellProps = Pick<
  ComponentProps<typeof PortalAuthShell>,
  'children' | 'qr'
> &
  Partial<
    Pick<ComponentProps<typeof PortalAuthShell>, 'title' | 'description'>
  >;

export function ClientAuthShell({
  children,
  title,
  description,
  qr,
}: ClientAuthShellProps) {
  return (
    <PortalAuthShell
      {...CLIENT_AUTH_BRAND}
      title={title ?? CLIENT_AUTH_BRAND.title}
      description={description ?? CLIENT_AUTH_BRAND.description}
      qr={qr}
    >
      {children}
    </PortalAuthShell>
  );
}
