import type { ComponentProps } from 'react';
import { PortalAuthShell } from '@patina/design-system/PortalAuth';

const CLIENT_AUTH_BRAND = {
  eyebrow: 'YOUR HOME',
  title: 'Good to see you.',
  description: 'Your project, decisions, and orders are ready when you are.',
  accent: '#8FA18B',
  supportEmail: 'support@patina.com',
} as const;

type ClientAuthShellProps = Pick<
  ComponentProps<typeof PortalAuthShell>,
  'children'
> &
  Partial<
    Pick<ComponentProps<typeof PortalAuthShell>, 'title' | 'description'>
  >;

export function ClientAuthShell({
  children,
  title,
  description,
}: ClientAuthShellProps) {
  return (
    <PortalAuthShell
      {...CLIENT_AUTH_BRAND}
      title={title ?? CLIENT_AUTH_BRAND.title}
      description={description ?? CLIENT_AUTH_BRAND.description}
    >
      {children}
    </PortalAuthShell>
  );
}
