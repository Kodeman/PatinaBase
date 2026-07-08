'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@patina/supabase';
import type { NotificationPreferences } from '@patina/shared/types';
import { useAuth } from '@/hooks/use-auth';

type DigestFrequency = NotificationPreferences['digest_frequency'];

const TOGGLE_GROUPS: Array<{
  title: string;
  description: string;
  rows: Array<{
    key: keyof NotificationPreferences;
    label: string;
    help?: string;
  }>;
}> = [
  {
    title: 'Marketing & inspiration',
    description: 'Curated content, launches, and updates on pieces you follow.',
    rows: [
      { key: 'type_price_drop', label: 'Price drops' },
      { key: 'type_back_in_stock', label: 'Back in stock' },
      { key: 'type_wishlist_update', label: 'Wishlist updates' },
      { key: 'type_weekly_inspiration', label: 'Weekly inspiration' },
      { key: 'type_founding_circle', label: 'Founding Circle updates' },
      { key: 'type_product_launch', label: 'Product launches' },
      { key: 'type_seasonal_campaign', label: 'Seasonal campaigns' },
      { key: 'type_reengagement', label: 'Re-engagement' },
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

type ReminderCadence = NotificationPreferences['reminder_cadence'];

const REMINDER_CADENCE_OPTIONS: Array<{ value: ReminderCadence; label: string }> = [
  { value: 'immediate', label: 'Right away' },
  { value: 'daily_digest', label: 'Daily summary' },
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

  const { data: prefs, isLoading: prefsLoading, error: prefsError } =
    useNotificationPreferences();
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
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED] p-6">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-2xl font-semibold text-[#2C2926] mb-3">
            Sign in to manage preferences
          </h1>
          <p className="text-[#4A453F] text-[15px] mb-6">
            {tokenStatus.kind === 'applied'
              ? 'Your unsubscribe was applied. Sign in to manage other preferences.'
              : 'Sign in to view and update your notification preferences.'}
          </p>
          <a
            href="/auth/signin?callbackUrl=/preferences"
            className="inline-block bg-[#A3927C] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
          >
            Sign in
          </a>
        </div>
      </main>
    );
  }

  if (prefsError || !prefs) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED] p-6">
        <p className="text-[#C45B4A]">
          {prefsError instanceof Error
            ? prefsError.message
            : 'Could not load preferences.'}
        </p>
      </main>
    );
  }

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const effectiveTimezone = prefs.timezone || browserTz;

  return (
    <main className="min-h-screen bg-[#F5F1ED] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-[#2C2926] mb-2">
            Notification preferences
          </h1>
          <p className="text-[#4A453F] text-[15px]">
            Choose what you want to hear from us — and how. Order receipts and
            account alerts always send.
          </p>
        </header>

        <TokenStatusBanner status={tokenStatus} />
        <SaveStatus
          saving={updateMutation.isPending}
          savedAt={savedAt}
          error={updateMutation.error}
        />

        <Section title="Email" description="Master switch for email delivery.">
          <Toggle
            label="Email notifications"
            help="Turn off to stop all marketing email. Order receipts and account alerts still send."
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
                checked={!!prefs[row.key]}
                onChange={(v) => update({ [row.key]: v } as Partial<NotificationPreferences>)}
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
              <div className="flex gap-4 mt-3">
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
              <label className="block mt-3">
                <span className="block text-sm font-medium text-[#2C2926] mb-1">
                  Timezone
                </span>
                <select
                  value={effectiveTimezone}
                  onChange={(e) => update({ timezone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD4C8] rounded-md bg-white text-[#2C2926]"
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
          <fieldset className="space-y-2">
            <legend className="sr-only">Digest frequency</legend>
            {DIGEST_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="radio"
                  name="digest_frequency"
                  value={opt.value}
                  checked={prefs.digest_frequency === opt.value}
                  onChange={() => update({ digest_frequency: opt.value })}
                  className="h-4 w-4 border-[#DDD4C8] text-[#A3927C] focus:ring-[#A3927C]"
                />
                <span className="text-[15px] text-[#2C2926]">{opt.label}</span>
              </label>
            ))}
          </fieldset>
        </Section>

        <Section
          title="Reminders"
          description="How gentle nudges — proposal reminders and decision requests — reach you. Time-sensitive messages always arrive right away."
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">Reminder cadence</legend>
            {REMINDER_CADENCE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="radio"
                  name="reminder_cadence"
                  value={opt.value}
                  checked={(prefs.reminder_cadence ?? 'immediate') === opt.value}
                  onChange={() => update({ reminder_cadence: opt.value })}
                  className="h-4 w-4 border-[#DDD4C8] text-[#A3927C] focus:ring-[#A3927C]"
                />
                <span className="text-[15px] text-[#2C2926]">{opt.label}</span>
              </label>
            ))}
          </fieldset>
        </Section>
      </div>
    </main>
  );
}

function LoadingShell() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED]">
      <p className="text-[#7A736C]">Loading preferences…</p>
    </main>
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
  if (status.kind === 'applying') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 px-4 py-3 rounded-md border border-[#DDD4C8] bg-white text-sm text-[#4A453F]"
      >
        Applying unsubscribe link…
      </div>
    );
  }
  if (status.kind === 'applied') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 px-4 py-3 rounded-md border border-[#C8DCC0] bg-[#F1F7EC] text-sm text-[#3F5C32]"
      >
        Unsubscribe applied
        {status.type ? ` (${humanize(status.type)})` : ''}.
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="mb-4 px-4 py-3 rounded-md border border-[#E8C7BE] bg-[#FBEDE8] text-sm text-[#A24332]"
    >
      {status.message}
    </div>
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
  return (
    <section className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-[#EEE6DB]">
      <h2 className="font-serif text-lg font-semibold text-[#2C2926] mb-1">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-[#7A736C] mb-4">{description}</p>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

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
    <label
      className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="flex-1">
        <span className="block text-[15px] text-[#2C2926] font-medium">
          {label}
        </span>
        {help && (
          <span className="block text-xs text-[#7A736C] mt-0.5">{help}</span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-5 w-5 rounded border-[#DDD4C8] text-[#A3927C] focus:ring-[#A3927C]"
      />
    </label>
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
    <label className="flex-1">
      <span className="block text-sm font-medium text-[#2C2926] mb-1">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[#DDD4C8] rounded-md bg-white text-[#2C2926]"
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
        color: 'text-[#C45B4A]',
      };
    }
    if (saving) return { text: 'Saving…', color: 'text-[#7A736C]' };
    if (savedAt)
      return {
        text: `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        color: 'text-[#7A736C]',
      };
    return null;
  }, [error, saving, savedAt]);

  if (!status) return null;
  return (
    <div
      className={`mb-4 text-sm ${status.color}`}
      role="status"
      aria-live="polite"
    >
      {status.text}
    </div>
  );
}
