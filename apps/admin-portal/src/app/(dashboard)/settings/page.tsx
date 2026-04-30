'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  PageHeader,
  Section,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import type { SettingsOverview } from '@/app/api/admin/settings-overview/route';

async function fetchSettings(): Promise<SettingsOverview> {
  const res = await fetch('/api/admin/settings-overview', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load settings (${res.status})`);
  }
  const json = (await res.json()) as { data: SettingsOverview };
  return json.data;
}

function FlagRow({ label, enabled, description }: { label: string; enabled: boolean; description: string }) {
  const variant: StatusVariant = enabled ? 'success' : 'neutral';
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0">
      <div>
        <p className="type-label">{label}</p>
        <p className="type-body-small text-[var(--text-muted)]">{description}</p>
      </div>
      <StatusDot variant={variant} label={enabled ? 'Enabled' : 'Disabled'} />
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3 last:border-b-0 gap-4">
      <span className="type-label">{label}</span>
      <span className="font-mono text-[0.78rem] text-[var(--text-muted)] truncate max-w-[60%] text-right">
        {value ?? <span className="italic">unset</span>}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-settings-overview'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Operational configuration for this admin instance. Read-only — change via .env redeploy."
      />

      {isError ? (
        <Section className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load settings: {(error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      ) : isLoading || !data ? (
        <Section className="mt-10">
          <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
        </Section>
      ) : (
        <>
          <Section title="Caller" className="mt-10">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="type-label">Email</span>
                <span className="font-mono text-[0.85rem]">{data.caller.email ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="type-label">Roles</span>
                <div className="flex flex-wrap gap-2 justify-end">
                  {data.caller.roles.length ? (
                    data.caller.roles.map((r) => (
                      <Badge key={r} variant="outline">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="type-meta-small italic">none</span>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <div className="mt-10 grid gap-10 md:grid-cols-2">
            <Section title="Environment">
              <ConfigRow label="NODE_ENV" value={data.environment.nodeEnv} />
              <ConfigRow label="NEXT_PUBLIC_ENV" value={data.environment.publicEnv} />
              <ConfigRow label="App URL" value={data.environment.appUrl} />
              <ConfigRow label="Supabase URL" value={data.environment.supabaseUrl} />
              <ConfigRow label="Orders service" value={data.environment.ordersServiceUrl} />
              <ConfigRow label="Media service" value={data.environment.mediaServiceUrl} />
              <ConfigRow label="Projects service" value={data.environment.projectsServiceUrl} />
            </Section>

            <Section title="Email">
              <ConfigRow label="Sender" value={data.email.senderFrom} />
              <ConfigRow label="Domain" value={data.email.domain} />
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3">
                <span className="type-label">Suppression list</span>
                <span className="font-mono text-[0.85rem]">
                  {data.email.suppressedCount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="type-label">Bounced (30d)</span>
                <span className="font-mono text-[0.85rem]">
                  {data.email.bouncedLast30Days.toLocaleString()}
                </span>
              </div>
            </Section>
          </div>

          <Section title="Feature flags" className="mt-10">
            <p className="type-body-small text-[var(--text-muted)] mb-4">
              These are environment flags loaded at build/deploy time. There is no live{' '}
              <code className="font-mono">feature_flags</code> table yet — see{' '}
              <a href={'/flags' as any} className="underline">/flags</a>.
            </p>
            <FlagRow
              label="MFA enforcement"
              enabled={data.flags.mfaEnabled}
              description="NEXT_PUBLIC_ENABLE_MFA — gates UI hooks for MFA prompts. Server-side enforcement is separate."
            />
            <FlagRow
              label="Dual-control approvals"
              enabled={data.flags.dualControlEnabled}
              description="NEXT_PUBLIC_ENABLE_DUAL_CONTROL — gates two-approver UI on high-risk operations."
            />
            <FlagRow
              label="Impersonation"
              enabled={data.flags.impersonationEnabled}
              description="NEXT_PUBLIC_ENABLE_IMPERSONATION — admin-as-user impersonation flow (off in production by default)."
            />
            <FlagRow
              label="Analytics tracking"
              enabled={data.flags.analyticsEnabled}
              description="NEXT_PUBLIC_ENABLE_ANALYTICS — turns PostHog tracking on for this portal."
            />
            <FlagRow
              label="Debug mode"
              enabled={data.flags.debugEnabled}
              description="NEXT_PUBLIC_ENABLE_DEBUG — extra console logs and devtools."
            />
          </Section>
        </>
      )}
    </div>
  );
}
