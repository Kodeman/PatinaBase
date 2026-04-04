'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { StrataMark } from '@/components/portal/strata-mark';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingStrata />;

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="pt-8">
      {/* Profile Header */}
      <div className="flex items-center gap-6 pb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-patina-pearl text-2xl font-medium text-patina-mocha">
          {initials}
        </div>
        <div>
          <h1 className="type-page-title">{user?.name || 'Designer'}</h1>
          <p className="type-label-secondary">{user?.email}</p>
        </div>
      </div>

      <StrataMark variant="full" />

      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <FieldGroup label="Account Information">
            <DetailRow label="Name" value={user?.name || 'Not set'} />
            <DetailRow label="Email" value={user?.email || '—'} />
            <DetailRow
              label="Roles"
              value={user?.roles?.join(', ') || 'designer'}
            />
          </FieldGroup>

          <FieldGroup label="Permissions">
            {user?.permissions && user.permissions.length > 0 ? (
              <div className="space-y-1">
                {user.permissions.map((perm: string) => (
                  <p key={perm} className="type-body-small">
                    {perm}
                  </p>
                ))}
              </div>
            ) : (
              <p className="type-body-small text-[var(--text-muted)]">
                Default permissions
              </p>
            )}
          </FieldGroup>
        </div>

        <div>
          <FieldGroup label="Active Sessions">
            <p className="type-body-small text-[var(--text-muted)]">
              Session information will appear here.
            </p>
          </FieldGroup>
        </div>
      </div>

      <div className="mt-8">
        <PortalButton variant="secondary">
          <Link href="/portal/settings" className="no-underline text-inherit">
            Edit Settings
          </Link>
        </PortalButton>
      </div>
    </div>
  );
}
