'use client';

import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import {
  PageHeader,
  Section,
  ListRow,
  StatusDot,
} from '@/components/portal';
import { Badge } from '@/components/ui/badge';
import type { SettingsOverview } from '@/app/api/admin/settings-overview/route';

async function fetchSettings(): Promise<SettingsOverview> {
  const res = await fetch('/api/admin/settings-overview', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load flags (${res.status})`);
  }
  const json = (await res.json()) as { data: SettingsOverview };
  return json.data;
}

interface FlagDescriptor {
  envVar: string;
  description: string;
  key: keyof SettingsOverview['flags'];
}

const FLAGS: FlagDescriptor[] = [
  {
    envVar: 'NEXT_PUBLIC_ENABLE_MFA',
    description: 'Gate UI prompts for multi-factor authentication. Server-side enforcement is separate.',
    key: 'mfaEnabled',
  },
  {
    envVar: 'NEXT_PUBLIC_ENABLE_DUAL_CONTROL',
    description: 'Show second-approver UI on high-risk operations.',
    key: 'dualControlEnabled',
  },
  {
    envVar: 'NEXT_PUBLIC_ENABLE_IMPERSONATION',
    description: 'Allow admins to impersonate other users (off in production by default).',
    key: 'impersonationEnabled',
  },
  {
    envVar: 'NEXT_PUBLIC_ENABLE_ANALYTICS',
    description: 'Enable PostHog analytics tracking for this portal.',
    key: 'analyticsEnabled',
  },
  {
    envVar: 'NEXT_PUBLIC_ENABLE_DEBUG',
    description: 'Extra console logs and dev tools.',
    key: 'debugEnabled',
  },
];

export default function FlagsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-settings-overview'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Feature"
        accent="Flags"
        description="Build-time env flags loaded by this admin instance. There is no runtime feature_flags table yet — toggle by redeploying with the relevant NEXT_PUBLIC_* env var changed."
      />

      {isError ? (
        <Section className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load flags: {(error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      ) : (
        <Section
          title="Environment flags"
          className="mt-10"
          action={
            data?.environment ? (
              <Badge variant="outline">{data.environment.publicEnv}</Badge>
            ) : null
          }
        >
          <div>
            {FLAGS.map((flag) => {
              const enabled = data?.flags[flag.key] ?? false;
              return (
                <ListRow
                  key={flag.envVar}
                  leading={<Flag className="h-4 w-4 text-[var(--text-muted)]" />}
                  title={<span className="font-mono text-[0.85rem]">{flag.envVar}</span>}
                  meta={[flag.description]}
                  right={
                    <>
                      <StatusDot
                        variant={enabled ? 'success' : 'neutral'}
                        label={isLoading ? '…' : enabled ? 'Enabled' : 'Disabled'}
                      />
                    </>
                  }
                />
              );
            })}
          </div>
          <p className="type-meta-small text-[var(--text-muted)] mt-6">
            Future: a runtime <code className="font-mono">feature_flags</code> table backed by an
            edit UI. Tracked in <code className="font-mono">apps/admin-portal/docs/GAPS.md</code>.
          </p>
        </Section>
      )}
    </div>
  );
}
