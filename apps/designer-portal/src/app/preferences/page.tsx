'use client';

/**
 * /preferences — the notification-preferences editor (R91), rehoused here by the
 * R21 dissolve. It was briefly a forwarding shim to /portal/preferences so the
 * editor could borrow the zone navigation shell; that shell is gone, and this
 * address is the PERMANENT one: it is printed into email footers, so it can
 * never be a redirect to something that might move again.
 *
 * Two audiences, one page — deliberately outside the (document) route group:
 *  · a recipient arriving from an email footer with `?token=…` (possibly signed
 *    out). The token is applied ONCE through POST /api/preferences/apply-token,
 *    then erased from the URL so a re-visit or a shared link can't re-fire it.
 *    A signed-out visitor still sees their unsubscribe confirmed.
 *  · a signed-in designer editing channels / quiet hours / digest cadence, with
 *    every toggle written through on change (no Save button).
 *
 * The signed-in designer's normal door to the same settings is the Account
 * sheet — /desk?account=notifications. This page stays the plain, shell-less
 * one because it must render for people who are not signed in.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@patina/supabase';
import type { NotificationPreferences } from '@patina/shared/types';
import { useAuth } from '@/hooks/use-auth';
import { DocumentAction } from '@/components/document/document-action';

type DigestFrequency = NotificationPreferences['digest_frequency'];

const TOGGLE_GROUPS: Array<{
  title: string;
  description: string;
  rows: Array<{
    key: keyof NotificationPreferences;
    label: string;
    help?: string;
    alwaysOn?: boolean;
  }>;
}> = [
  {
    title: 'Designer activity',
    description: 'Lead, client, and project updates that drive your work.',
    rows: [
      { key: 'type_new_lead', label: 'New leads', help: 'A client has requested you' },
      { key: 'type_lead_expiring', label: 'Lead expiring soon', help: '24-hour warning before reassignment' },
      { key: 'type_lead_response', label: 'Lead responses', help: 'Clients replying to your outreach' },
      { key: 'type_client_message', label: 'Client messages' },
      { key: 'type_project_milestone', label: 'Project milestones' },
      { key: 'type_commission_earned', label: 'Commission earned' },
    ],
  },
  {
    title: 'Marketing',
    description: 'Inspiration, launches, and occasional campaigns.',
    rows: [
      { key: 'type_new_products', label: 'New products' },
      { key: 'type_weekly_inspiration', label: 'Weekly inspiration' },
      { key: 'type_founding_circle', label: 'Founding Circle updates' },
      { key: 'type_product_launch', label: 'Product launches' },
      { key: 'type_seasonal_campaign', label: 'Seasonal campaigns' },
      { key: 'type_reengagement', label: 'Re-engagement' },
    ],
  },
  {
    title: 'Account',
    description: 'Receipts and security. Critical alerts may bypass these toggles.',
    rows: [
      // `alwaysOn` is the honest rendering of "Always on": the row shows as
      // checked and refuses the click, rather than offering a switch that the
      // delivery side will override anyway.
      { key: 'type_account_security', label: 'Account & security', help: 'Always on', alwaysOn: true },
      { key: 'type_order_confirmation', label: 'Order confirmations', help: 'Always on', alwaysOn: true },
      { key: 'type_payment_receipt', label: 'Payment receipts', help: 'Always on', alwaysOn: true },
    ],
  },
];

const DIGEST_OPTIONS: Array<{ value: DigestFrequency; label: string }> = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly' },
];

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Phoenix',
  'Pacific/Honolulu',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'UTC',
];

export default function PreferencesPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <PreferencesPageInner />
    </Suspense>
  );
}

function PreferencesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const token = searchParams.get('token');
  const tokenAppliedRef = useRef(false);
  const [tokenStatus, setTokenStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'applying' }
    | { kind: 'applied'; type?: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Held back until there is a session. The query function throws
  // `Not authenticated` with no user, and a thrown query error lands in the
  // app's global QueryCache error handler — i.e. an error toast on the one page
  // that is REQUIRED to answer signed-out visitors (R91). Disabled, it costs
  // nothing and reports nothing; the signed-out gate below renders instead.
  const { data: prefs, isLoading: prefsLoading, error: prefsError } =
    useNotificationPreferences({ enabled: isAuthenticated });
  const updateMutation = useUpdateNotificationPreferences();

  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!token || tokenAppliedRef.current) return;
    tokenAppliedRef.current = true;
    setTokenStatus({ kind: 'applying' });

    (async () => {
      try {
        const res = await fetch('/api/preferences/apply-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok) {
          setTokenStatus({ kind: 'applied', type: data?.type });
        } else {
          setTokenStatus({
            kind: 'error',
            message:
              data?.message ||
              (data?.status === 'expired'
                ? 'This link has expired.'
                : 'We could not apply that link.'),
          });
        }
      } catch (err) {
        setTokenStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Network error',
        });
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        router.replace(url.pathname + (url.search || ''));
      }
    })();
  }, [token, router]);

  const timezones = useMemo(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const set = new Set([browserTz, ...COMMON_TIMEZONES]);
    return Array.from(set);
  }, []);

  function update(updates: Partial<NotificationPreferences>) {
    updateMutation.mutate(updates, {
      onSuccess: () => setSavedAt(new Date()),
    });
  }

  if (authLoading || prefsLoading) {
    return <LoadingShell />;
  }

  if (!isAuthenticated) {
    return (
      <Page>
        {/* No back act: a signed-out visitor has no Desk to go back to. */}
        <header className="hline">
          <div className="hline-l">
            <h1 className="t-d2">Preferences</h1>
          </div>
        </header>
        <div className="rule-strong" role="presentation" />
        {/* The token's outcome is reported HERE, not only on the signed-in
            page — the emailed footer link is followed by people who are not
            signed in, and R91's contract is that the page renders and says
            what happened. An applied token shows its confirmation; a bad or
            expired one says so plainly instead of failing silently. */}
        <TokenStatusBanner status={tokenStatus} />
        <section aria-label="Sign in" className="section">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <p className="empty-t">
              {tokenStatus.kind === 'applied'
                ? 'Sign in to manage the rest of your preferences.'
                : 'Sign in to view and update your notification preferences.'}
            </p>
            <DocumentAction
              actionKey="preferences-sign-in"
              href="/auth/signin?callbackUrl=/preferences"
              variant="secondary"
            >
              Sign in
            </DocumentAction>
          </div>
        </section>
      </Page>
    );
  }

  if (prefsError || !prefs) {
    return (
      <Page>
        <p role="alert" className="t-body pt-12 text-[var(--terracotta-ink)]">
          {prefsError instanceof Error
            ? prefsError.message
            : 'Could not load preferences.'}
        </p>
      </Page>
    );
  }

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const effectiveTimezone = prefs.timezone || browserTz;

  return (
    <Page>
      {/* US-28 S6 — the Header line: the back act, the title, then the
          double rule. The save status rides on its right; chrome never fills. */}
      <header className="hline">
        <div className="hline-l">
          <DocumentAction
            actionKey="preferences-back-to-desk"
            href="/desk"
            variant="tertiary"
            leading="←"
          >
            Desk
          </DocumentAction>
          <h1 className="t-d2">Preferences</h1>
        </div>
        <div className="hline-r">
          <SaveStatus
            saving={updateMutation.isPending}
            savedAt={savedAt}
            error={updateMutation.error}
          />
        </div>
      </header>
      <div className="rule-strong" role="presentation" />

      <TokenStatusBanner status={tokenStatus} />

      <Section title="Email" description="Master switch for email delivery.">
        <Toggle
          label="Email notifications"
          help="Turn off to stop all marketing email. Transactional alerts may still send."
          checked={prefs.channels_email}
          onChange={(v) => update({ channels_email: v })}
        />
      </Section>

      {TOGGLE_GROUPS.map((group) => (
        <Section
          key={group.title}
          title={group.title}
          description={group.description}
        >
          {group.rows.map((row) => (
            <Toggle
              key={String(row.key)}
              label={row.label}
              help={row.help}
              checked={row.alwaysOn ? true : !!prefs[row.key]}
              disabled={row.alwaysOn}
              onChange={
                row.alwaysOn
                  ? undefined
                  : (v) => update({ [row.key]: v } as Partial<NotificationPreferences>)
              }
            />
          ))}
        </Section>
      ))}

      <Section
        title="Quiet hours"
        description="Pause non-urgent notifications during set hours."
      >
        <Toggle
          label="Enable quiet hours"
          checked={prefs.quiet_hours_enabled}
          onChange={(v) => update({ quiet_hours_enabled: v })}
        />
        {prefs.quiet_hours_enabled && (
          <>
            <div className="mt-4 flex flex-wrap gap-4">
              <TimeField
                label="Start"
                value={prefs.quiet_hours_start ?? '22:00'}
                onChange={(v) => update({ quiet_hours_start: v })}
              />
              <TimeField
                label="End"
                value={prefs.quiet_hours_end ?? '08:00'}
                onChange={(v) => update({ quiet_hours_end: v })}
              />
            </div>
            <label className="mt-4 block max-w-[420px]">
              <span className="eb mb-2">Timezone</span>
              <select
                value={effectiveTimezone}
                onChange={(e) => update({ timezone: e.target.value })}
                className="field-control text-[var(--text-primary)]"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                    {tz === browserTz ? ' (your timezone)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </Section>

      <Section
        title="Digest frequency"
        description="Bundle routine updates into a single email."
      >
        <fieldset>
          <legend className="sr-only">Digest frequency</legend>
          <ul className="rows">
            {DIGEST_OPTIONS.map((opt) => (
              <li key={opt.value} className="border-b border-[var(--doc-ink-border)]">
                <label className="check">
                  <input
                    type="radio"
                    name="digest_frequency"
                    value={opt.value}
                    checked={prefs.digest_frequency === opt.value}
                    onChange={() => update({ digest_frequency: opt.value })}
                    className="check-input"
                  />
                  <span className="check-box is-one" aria-hidden="true" />
                  <span className="t-body text-[var(--text-primary)]">{opt.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </Section>
    </Page>
  );
}

/** US-28 S6 — the page on the --paper ground at the house measure. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[880px] px-6 pb-24 max-[599px]:px-4">{children}</div>
    </main>
  );
}

function LoadingShell() {
  return (
    <Page>
      <p role="status" className="t-body-sm pt-12 text-[var(--text-subtle)]">
        Loading preferences…
      </p>
    </Page>
  );
}

function TokenStatusBanner({
  status,
}: {
  status:
    | { kind: 'idle' }
    | { kind: 'applying' }
    | { kind: 'applied'; type?: string }
    | { kind: 'error'; message: string };
}) {
  if (status.kind === 'idle') return null;
  // US-28 S6 — the outcome is a sentence in ink on the paper, never a
  // tinted box; only the failure takes terracotta-ink.
  if (status.kind === 'applying') {
    return (
      <p role="status" aria-live="polite" className="t-body mb-8 text-[var(--text-muted)]">
        Applying unsubscribe link…
      </p>
    );
  }
  if (status.kind === 'applied') {
    return (
      <p role="status" aria-live="polite" className="t-body mb-8 text-[var(--text-primary)]">
        Unsubscribe applied
        {status.type ? ` (${humanize(status.type)})` : ''}.
      </p>
    );
  }
  return (
    <p role="alert" className="t-body mb-8 text-[var(--terracotta-ink)]">
      {status.message}
    </p>
  );
}

function humanize(value: string) {
  return value.replace(/_/g, ' ');
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  // US-28 S6 — a Section (uplift (b)1): the eyebrow, one line on what it
  // holds, its rows, its own closing rule. Never a white card.
  return (
    <section aria-label={title} className="section">
      <div className="sec-head">
        <h2 className="eb">
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>{title}</span>
        </h2>
      </div>
      {description && (
        <p className="t-body-sm mb-3 max-w-[64ch] text-[var(--text-muted)]">{description}</p>
      )}
      {children}
    </section>
  );
}

/** One row with the house check (specimens `.check`): the native checkbox
 *  stays for the keyboard and the reader; the box is drawn in ink. */
function Toggle({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-b border-[var(--doc-ink-border)] py-1 first:border-t">
      <label className="check items-start py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          className="check-input"
        />
        <span className="check-box mt-0.5" aria-hidden="true">
          <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path d="M2.5 7.5l3 3 6-7" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-body block text-[var(--text-primary)]">{label}</span>
          {help && (
            <span className="t-body-sm block text-[var(--text-subtle)]">{help}</span>
          )}
        </span>
      </label>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block w-[200px] max-w-full">
      <span className="eb mb-2">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-control text-[var(--text-primary)]"
      />
    </label>
  );
}

function SaveStatus({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: Date | null;
  error: unknown;
}) {
  const status = useMemo(() => {
    if (error) {
      return {
        text: error instanceof Error ? error.message : 'Save failed',
        color: 'text-[var(--terracotta-ink)]',
      };
    }
    if (saving) return { text: 'Saving…', color: 'text-[var(--text-subtle)]' };
    if (savedAt)
      return {
        text: `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        color: 'text-[var(--text-subtle)]',
      };
    return null;
  }, [error, saving, savedAt]);

  // The live region stays mounted so the first "Saving…" is announced.
  return (
    <p className={`t-meta ${status?.color ?? ''}`} role="status" aria-live="polite">
      {status?.text}
    </p>
  );
}
