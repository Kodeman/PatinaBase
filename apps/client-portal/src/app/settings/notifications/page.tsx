'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { NotificationPreferences } from '@patina/shared/types';
import {
  useMyThreadOverrides,
  useUpdateThreadNotificationPref,
  useMuteThread,
  type ThreadOverride,
  type NotificationPref,
} from '@patina/supabase';

const CATEGORIES: Array<{
  title: string;
  description: string;
  rows: Array<{ key: keyof NotificationPreferences; label: string; help?: string }>;
}> = [
  {
    title: 'Projects & collaboration',
    description: 'Updates on your projects, designers, and decisions.',
    rows: [
      { key: 'type_project_milestone', label: 'Project milestones', help: 'Design reveals, approvals, delivery dates' },
      { key: 'type_client_message', label: 'Messages', help: 'New messages from your designer or team' },
    ],
  },
  {
    title: 'Orders',
    description: "Receipts and shipping updates. Can't be fully disabled.",
    rows: [
      { key: 'type_order_confirmation', label: 'Order confirmations' },
      { key: 'type_payment_receipt', label: 'Payment receipts' },
    ],
  },
  {
    title: 'Product alerts',
    description: 'Updates on pieces you&apos;ve saved or asked about.',
    rows: [
      { key: 'type_price_drop', label: 'Price drops' },
      { key: 'type_back_in_stock', label: 'Back in stock' },
      { key: 'type_wishlist_update', label: 'Wishlist updates' },
    ],
  },
  {
    title: 'Inspiration',
    description: 'Occasional curated content. Easy to mute.',
    rows: [
      { key: 'type_weekly_inspiration', label: 'Weekly inspiration' },
      { key: 'type_new_products', label: 'New products' },
      { key: 'type_product_launch', label: 'Product launches' },
      { key: 'type_seasonal_campaign', label: 'Seasonal features' },
    ],
  },
];

async function fetchPrefs(): Promise<NotificationPreferences> {
  const res = await fetch('/api/user/preferences');
  if (!res.ok) throw new Error('Failed to load preferences');
  return res.json();
}

async function patchPrefs(updates: Partial<NotificationPreferences>) {
  const res = await fetch('/api/user/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  return res.json();
}

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    fetchPrefs()
      .then((p) => setPrefs(p))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function update(key: keyof NotificationPreferences, value: unknown) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value } as NotificationPreferences;
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const saved = await patchPrefs({ [key]: value } as Partial<NotificationPreferences>);
      setPrefs(saved);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED]">
        <p className="text-[#7A736C]">Loading preferences…</p>
      </main>
    );
  }

  if (!prefs) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED]">
        <p className="text-[#C45B4A]">Sign in to manage preferences.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F1ED] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-[#2C2926] mb-2">
            Notifications
          </h1>
          <p className="text-[#4A453F] text-[15px]">
            Choose what you want to hear from us — and how.
          </p>
        </header>

        <SaveStatus saving={saving} savedAt={savedAt} error={error} />

        <Section title="Delivery channels" description="Where you receive notifications.">
          <Toggle
            label="Email"
            checked={prefs.channels_email}
            onChange={(v) => update('channels_email', v)}
          />
          <Toggle
            label="In-app"
            checked={prefs.channels_in_app}
            onChange={(v) => update('channels_in_app', v)}
          />
          <Toggle
            label="Push (mobile)"
            checked={prefs.channels_push}
            onChange={(v) => update('channels_push', v)}
            help="Requires the Patina mobile app"
          />
          <Toggle label="SMS" checked={prefs.channels_sms} disabled help="Coming soon" />
        </Section>

        {CATEGORIES.map((cat) => (
          <Section key={cat.title} title={cat.title} description={cat.description}>
            {cat.rows.map((row) => (
              <Toggle
                key={String(row.key)}
                label={row.label}
                help={row.help}
                checked={!!prefs[row.key]}
                onChange={(v) => update(row.key, v)}
              />
            ))}
          </Section>
        ))}

        <Section title="Digest" description="Batch routine updates into a single email.">
          <label className="block">
            <span className="block text-sm font-medium text-[#2C2926] mb-2">
              Frequency
            </span>
            <select
              value={prefs.digest_frequency ?? 'never'}
              onChange={(e) =>
                update('digest_frequency', e.target.value as NotificationPreferences['digest_frequency'])
              }
              className="w-full max-w-xs px-3 py-2 border border-[#DDD4C8] rounded-md bg-white text-[#2C2926]"
            >
              <option value="never">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </Section>

        <MessagesSection />

        <Section
          title="Quiet hours"
          description="Pause non-urgent notifications during set hours."
        >
          <Toggle
            label="Enable quiet hours"
            checked={prefs.quiet_hours_enabled}
            onChange={(v) => update('quiet_hours_enabled', v)}
          />
          {prefs.quiet_hours_enabled && (
            <div className="flex gap-4 mt-3">
              <TimeField
                label="Start"
                value={prefs.quiet_hours_start ?? '22:00'}
                onChange={(v) => update('quiet_hours_start', v)}
              />
              <TimeField
                label="End"
                value={prefs.quiet_hours_end ?? '08:00'}
                onChange={(v) => update('quiet_hours_end', v)}
              />
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

function MessagesSection() {
  const { data: overrides = [], isLoading } = useMyThreadOverrides();
  const updatePref = useUpdateThreadNotificationPref();
  const muteThread = useMuteThread();

  const muted = overrides.filter((o) => o.muted_at);
  const customPref = overrides.filter(
    (o) => !o.muted_at && o.notification_pref !== 'all'
  );

  return (
    <Section
      title="Messages"
      description="Per-thread notification overrides. New threads default to all messages."
    >
      {isLoading ? (
        <p className="text-sm text-[#7A736C]">Loading overrides…</p>
      ) : overrides.length === 0 ? (
        <p className="text-sm text-[#7A736C]">
          No threads currently muted or customized. Use the bell or menu icons
          inside any conversation to set an override.
        </p>
      ) : (
        <>
          {muted.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[#7A736C] mb-2">
                Muted ({muted.length})
              </h3>
              <ul className="divide-y divide-[#EEE6DB] rounded border border-[#EEE6DB]">
                {muted.map((o) => (
                  <ThreadOverrideRow
                    key={o.thread_id}
                    override={o}
                    onUnmute={() =>
                      muteThread.mutate({
                        threadId: o.thread_id,
                        muted: false,
                      })
                    }
                  />
                ))}
              </ul>
            </div>
          )}
          {customPref.length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[#7A736C] mb-2">
                Custom preference ({customPref.length})
              </h3>
              <ul className="divide-y divide-[#EEE6DB] rounded border border-[#EEE6DB]">
                {customPref.map((o) => (
                  <ThreadOverrideRow
                    key={o.thread_id}
                    override={o}
                    onChangePref={(pref) =>
                      updatePref.mutate({ threadId: o.thread_id, pref })
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function ThreadOverrideRow({
  override,
  onUnmute,
  onChangePref,
}: {
  override: ThreadOverride;
  onUnmute?: () => void;
  onChangePref?: (pref: NotificationPref) => void;
}) {
  const label =
    override.thread_title ??
    override.counterpart_names.join(', ') ??
    'Conversation';
  const kindLabel =
    override.thread_kind === 'project'
      ? 'Project'
      : override.thread_kind === 'vendor_brief'
        ? 'Vendor brief'
        : 'Direct';

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/messages/${override.thread_id}`}
          className="block truncate text-[14px] font-medium text-[#2C2926] hover:underline"
        >
          {label}
        </Link>
        <p className="text-xs text-[#7A736C]">{kindLabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onUnmute && (
          <button
            type="button"
            onClick={onUnmute}
            className="rounded border border-[#DDD4C8] bg-white px-2 py-1 text-xs text-[#2C2926] hover:bg-[#F5F1E8]"
          >
            Unmute
          </button>
        )}
        {onChangePref && (
          <select
            value={override.notification_pref}
            onChange={(e) => onChangePref(e.target.value as NotificationPref)}
            className="rounded border border-[#DDD4C8] bg-white px-2 py-1 text-xs text-[#2C2926]"
          >
            <option value="all">All messages</option>
            <option value="mentions">Mentions only</option>
            <option value="none">No notifications</option>
          </select>
        )}
      </div>
    </li>
  );
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
      <h2 className="font-serif text-lg font-semibold text-[#2C2926] mb-1">{title}</h2>
      {description && <p className="text-sm text-[#7A736C] mb-4">{description}</p>}
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
        <span className="block text-[15px] text-[#2C2926] font-medium">{label}</span>
        {help && <span className="block text-xs text-[#7A736C] mt-0.5">{help}</span>}
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
      <span className="block text-sm font-medium text-[#2C2926] mb-1">{label}</span>
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
  error: string | null;
}) {
  const status = useMemo(() => {
    if (error) return { text: error, color: 'text-[#C45B4A]' };
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
    <div className={`mb-4 text-sm ${status.color}`} role="status" aria-live="polite">
      {status.text}
    </div>
  );
}
